const ethers = require('ethers');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { logger } = require('../common/log.service');
const { trexFactoryEventAbi } = require('./token-deployment-receipt.service');

// Minimal read-only ABI for the deployed T-REX token contract.
const tokenReadAbi = [
  'function owner() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

const deploymentAddressArgs = {
  identityRegistryAddress: '_ir',
  identityRegistryStorageAddress: '_irs',
  trustedIssuersRegistryAddress: '_tir',
  claimTopicsRegistryAddress: '_ctr',
  modularComplianceAddress: '_mc',
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const SETTING_KEYS = {
  interval: 'TrexDeploymentSyncInterval',
  lastSyncBlock: 'TrexDeploymentLastSyncBlock',
  blockOffset: 'TrexDeploymentBlockOffset',
  confirmationBlocks: 'TrexDeploymentConfirmationBlocks',
  startBlock: 'TrexDeploymentStartBlock',
  enabled: 'TrexDeploymentSyncEnabled',
};

// Read-only background reconciler. Discovers TREXSuiteDeployed events emitted by the
// configured TREX factory and synchronizes any deployment the normal flow missed. It
// never signs or submits a transaction.
class TrexDeploymentSyncService {
  constructor({
    settingRepository,
    organizationRepository,
    tokenRepository,
    attemptRepository,
    config = env.blockchain,
    transactionRunner = withTransaction,
    dependencies = {},
  }) {
    this.settingRepository = settingRepository;
    this.organizationRepository = organizationRepository;
    this.tokenRepository = tokenRepository;
    this.attemptRepository = attemptRepository;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory
      || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.factoryInterface = dependencies.factoryInterface || new ethers.Interface(trexFactoryEventAbi);
    this.deployedEvent = this.factoryInterface.getEvent('TREXSuiteDeployed');
    this.deployedTopic = this.deployedEvent.topicHash;
    // Injectable for tests; production reads directly from the token contract.
    this.tokenReader = dependencies.tokenReader
      || (async (provider, address) => {
        const contract = new ethers.Contract(address, tokenReadAbi, provider);
        const [owner, name, symbol] = await Promise.all([contract.owner(), contract.name(), contract.symbol()]);
        return { owner, name, symbol };
      });
    this.maxRetries = Number.isInteger(dependencies.maxRetries) ? dependencies.maxRetries : 3;
    this.retryBaseDelayMs = Number.isInteger(dependencies.retryBaseDelayMs) ? dependencies.retryBaseDelayMs : 500;
  }

  async getSettingRaw(key) {
    const row = await this.settingRepository.findByKey(key);
    return row ? row.settingValue : undefined;
  }

  async getNumber(key, fallback) {
    const raw = await this.getSettingRaw(key);
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  async getBoolean(key, fallback) {
    const raw = await this.getSettingRaw(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    return String(raw).toLowerCase() === 'true';
  }

  async isEnabled() {
    if (this.config.deploymentSyncEnabled === false) return false;
    return this.getBoolean(SETTING_KEYS.enabled, true);
  }

  isConfigured() {
    return Boolean(this.config.sepoliaRpcUrl)
      && Boolean(this.config.trexFactoryAddress)
      && ethers.isAddress(this.config.trexFactoryAddress);
  }

  async withRetry(work, label, stats) {
    let attempt = 0;
    let delay = this.retryBaseDelayMs;
    for (;;) {
      try {
        return await work();
      } catch (error) {
        attempt += 1;
        if (stats) stats.retries += 1;
        if (attempt >= this.maxRetries) throw error;
        logger.warn('TREX deployment sync: transient RPC failure, retrying', {
          label, attempt, nextDelayMs: delay, error: error.message,
        });
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  async run() {
    const startedAt = Date.now();
    const stats = {
      enabled: true,
      latestBlock: null,
      safeLatestBlock: null,
      fromBlock: null,
      toBlock: null,
      blocksScanned: 0,
      eventsFound: 0,
      synced: 0,
      skipped: 0,
      retries: 0,
      errors: 0,
      durationMs: 0,
    };

    if (!(await this.isEnabled())) {
      stats.enabled = false;
      logger.info('TREX deployment sync is disabled; skipping run');
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }
    if (!this.isConfigured()) {
      logger.warn('TREX deployment sync is not configured (RPC or factory address missing); skipping run');
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    const offset = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.blockOffset, 500)));
    const confirmationBlocks = Math.max(0, Math.trunc(await this.getNumber(SETTING_KEYS.confirmationBlocks, 2)));
    const startBlock = Math.max(0, Math.trunc(await this.getNumber(SETTING_KEYS.startBlock, 0)));
    let lastSync = Math.max(0, Math.trunc(await this.getNumber(SETTING_KEYS.lastSyncBlock, 0)));

    let provider;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const latestBlock = Number(await this.withRetry(() => provider.getBlockNumber(), 'getBlockNumber', stats));
      const safeLatestBlock = latestBlock - confirmationBlocks;
      stats.latestBlock = latestBlock;
      stats.safeLatestBlock = safeLatestBlock;

      logger.info('TREX deployment sync started', {
        latestBlock, safeLatestBlock, lastSync, offset, confirmationBlocks, startBlock,
      });

      // First run (no checkpoint): start from the configured start block, otherwise
      // one offset window behind the safe head so we never rescan the whole chain.
      if (lastSync <= 0) {
        lastSync = startBlock > 0 ? startBlock - 1 : Math.max(safeLatestBlock - offset, 0);
      }

      if (safeLatestBlock <= 0 || lastSync >= safeLatestBlock) {
        logger.info('TREX deployment sync: no confirmed new blocks to process', { lastSync, safeLatestBlock });
        stats.durationMs = Date.now() - startedAt;
        return stats;
      }

      let from = lastSync + 1;
      stats.fromBlock = from;
      while (from <= safeLatestBlock) {
        const to = Math.min(from + offset - 1, safeLatestBlock);

        let logs;
        try {
          logs = await this.withRetry(() => provider.getLogs({
            address: this.config.trexFactoryAddress,
            topics: [this.deployedTopic],
            fromBlock: from,
            toBlock: to,
          }), `getLogs ${from}-${to}`, stats);
        } catch (error) {
          // Persistent failure for this chunk: do not advance the checkpoint; the next
          // scheduled run resumes from the same block.
          stats.errors += 1;
          logger.error('TREX deployment sync: block range failed after retries; checkpoint not advanced', {
            from, to, error: { message: error.message, stack: error.stack },
          });
          break;
        }

        stats.eventsFound += logs.length;
        for (const log of logs) {
          try {
            const outcome = await this.processLog(provider, log, stats);
            if (outcome === 'synced') stats.synced += 1;
            else stats.skipped += 1;
          } catch (error) {
            stats.skipped += 1;
            stats.errors += 1;
            logger.warn('TREX deployment sync: event processing failed', {
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
              error: { message: error.message, stack: error.stack },
            });
          }
        }

        stats.blocksScanned += (to - from + 1);
        stats.toBlock = to;
        // Advance the checkpoint only after a chunk is fully processed.
        await this.settingRepository.setValueByKey(SETTING_KEYS.lastSyncBlock, to);
        from = to + 1;
      }

      stats.durationMs = Date.now() - startedAt;
      logger.info('TREX deployment sync completed', stats);
      return stats;
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async processLog(provider, log, stats) {
    const parsed = this.factoryInterface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed || parsed.name !== 'TREXSuiteDeployed') return 'skipped';

    const tokenAddress = ethers.getAddress(parsed.args._token);
    const suiteAddresses = {};
    for (const [field, arg] of Object.entries(deploymentAddressArgs)) {
      const value = parsed.args[arg];
      suiteAddresses[field] = ethers.isAddress(value) ? ethers.getAddress(value) : null;
    }
    // `_salt` is an indexed string, so only its keccak256 hash is available on-chain.
    const deploymentSalt = log.topics[2] || null;
    const transactionHash = String(log.transactionHash).toLowerCase();
    const blockNumber = Number(log.blockNumber);

    // Read-only metadata from the deployed token.
    const tokenInfo = await this.withRetry(
      () => this.tokenReader(provider, tokenAddress),
      `readToken ${tokenAddress}`,
      stats,
    );
    const ownerWallet = String(tokenInfo.owner || '');
    if (!ethers.isAddress(ownerWallet)) {
      logger.info('TREX deployment sync: token owner is not a valid address; skipping', { tokenAddress });
      return 'skipped';
    }

    // Ownership verification: map the on-chain owner back to an organization.
    const organization = await this.organizationRepository.findByWalletAddress(ownerWallet.toLowerCase());
    if (!organization) {
      logger.info('TREX deployment sync: no organization matches the token owner; skipping', {
        tokenAddress, ownerWallet, transactionHash,
      });
      return 'skipped';
    }

    const token = await this.tokenRepository.findByOrganizationUid(organization.organizationUid);
    if (!token) {
      logger.info('TREX deployment sync: organization has no token record; skipping', {
        organizationUid: organization.organizationUid, tokenAddress,
      });
      return 'skipped';
    }

    // Idempotency: already synchronized?
    if (token.status === 'deployed') {
      if (token.tokenAddress && token.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()) {
        logger.info('TREX deployment sync: token already synchronized; skipping', {
          tokenUid: token.tokenUid, tokenAddress,
        });
      } else {
        logger.warn('TREX deployment sync: token already deployed with a different address; skipping', {
          tokenUid: token.tokenUid, existing: token.tokenAddress, discovered: tokenAddress,
        });
      }
      return 'skipped';
    }

    // Token metadata verification (name + symbol must match the pending record).
    if (String(token.tokenName) !== String(tokenInfo.name) || String(token.tokenSymbol) !== String(tokenInfo.symbol)) {
      logger.warn('TREX deployment sync: token metadata mismatch; skipping', {
        tokenUid: token.tokenUid,
        db: { name: token.tokenName, symbol: token.tokenSymbol },
        chain: { name: tokenInfo.name, symbol: tokenInfo.symbol },
      });
      return 'skipped';
    }

    // Cross-token uniqueness guards (contract address / tx hash not owned elsewhere).
    if (this.tokenRepository.findByTokenAddressExcept) {
      const addressOwner = await this.tokenRepository.findByTokenAddressExcept(tokenAddress, token.tokenUid);
      if (addressOwner) {
        logger.warn('TREX deployment sync: contract address already assigned to another token; skipping', {
          tokenAddress, otherTokenUid: addressOwner.tokenUid,
        });
        return 'skipped';
      }
    }
    if (this.tokenRepository.findByDeployTxHashExcept) {
      const hashOwner = await this.tokenRepository.findByDeployTxHashExcept(transactionHash, token.tokenUid);
      if (hashOwner) {
        logger.warn('TREX deployment sync: transaction hash already linked to another token; skipping', {
          transactionHash, otherTokenUid: hashOwner.tokenUid,
        });
        return 'skipped';
      }
    }

    // Best-effort sender + block timestamp (read-only).
    let platformAgentWallet = null;
    try {
      const tx = await this.withRetry(() => provider.getTransaction(transactionHash), `getTransaction ${transactionHash}`, stats);
      if (tx && ethers.isAddress(tx.from)) platformAgentWallet = ethers.getAddress(tx.from);
    } catch (error) {
      logger.warn('TREX deployment sync: could not resolve transaction sender', { transactionHash, error: error.message });
    }
    let deployedAt = new Date();
    try {
      const block = await this.withRetry(() => provider.getBlock(blockNumber), `getBlock ${blockNumber}`, stats);
      const timestamp = Number(block?.timestamp);
      if (Number.isSafeInteger(timestamp) && timestamp > 0) deployedAt = new Date(timestamp * 1000);
    } catch (error) {
      logger.warn('TREX deployment sync: could not resolve block timestamp; using server time', { blockNumber, error: error.message });
    }

    const contractTxnMessage = `Recovered by background TREX deployment sync in block ${blockNumber}.`;
    const finalizeFields = {
      platformAgentWallet,
      tokenAddress,
      ...suiteAddresses,
      deployTxHash: transactionHash,
      deploymentSalt,
      deployedAtBlock: blockNumber,
      deployedAt,
      contractAddress: tokenAddress,
      contractTxnHash: transactionHash,
      contractTxnMessage,
      currentStep: 'deployed',
      isDraft: false,
      status: 'deployed',
    };

    // Atomic finalize: token + any related deployment attempt, under one transaction.
    await this.transactionRunner(async (connection) => {
      const updated = await this.tokenRepository.updateDeploymentByUserUid(token.userUid, finalizeFields, connection);
      if (!updated) {
        const current = await this.tokenRepository.findByUserUid(token.userUid, connection);
        if (current && current.status === 'deployed') return; // finalized concurrently
        throw new Error('Token status changed during sync finalization; will retry next run.');
      }
      if (this.attemptRepository) {
        const attempt = await this.attemptRepository.findByTokenAndHash(token.tokenUid, transactionHash, connection)
          || await this.attemptRepository.findActiveByToken(token.tokenUid, connection);
        if (attempt && attempt.status !== 'confirmed') {
          await this.attemptRepository.update(attempt.deploymentAttemptUid, {
            status: 'confirmed',
            transactionHash,
            contractAddress: tokenAddress,
            blockNumber,
            confirmedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          }, connection);
        }
      }
    });

    logger.info('TREX deployment sync: deployment recovered and synchronized', {
      tokenUid: token.tokenUid,
      organizationUid: organization.organizationUid,
      tokenAddress,
      transactionHash,
      blockNumber,
    });
    return 'synced';
  }
}

module.exports = { TrexDeploymentSyncService, SETTING_KEYS, tokenReadAbi };
