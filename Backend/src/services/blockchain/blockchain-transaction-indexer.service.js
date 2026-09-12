const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ethers } = require('ethers');
const { env } = require('../../core/config/env');
const { logger } = require('../common/log.service');
const { TOKEN_ABI, sameAddress } = require('./blockchain-transaction.service');

const INDEXER_NAME = 'canonicalTransactions';
const SETTING_KEYS = Object.freeze({
  enabled: 'TransactionIndexerEnabled',
  intervalSeconds: 'TransactionIndexerIntervalSeconds',
  blockOffset: 'TransactionIndexerBlockOffset',
  confirmationBlocks: 'TransactionIndexerConfirmationBlocks',
  addressBatchSize: 'TransactionIndexerAddressBatchSize',
  leaseSeconds: 'TransactionIndexerLeaseSeconds',
  maxChunksPerRun: 'TransactionIndexerMaxChunksPerRun',
  reorgLookbackBlocks: 'TransactionIndexerReorgLookbackBlocks',
});
const DEFAULTS = Object.freeze({
  intervalSeconds: 15,
  blockOffset: 1000,
  confirmationBlocks: 2,
  addressBatchSize: 100,
  leaseSeconds: 180,
  maxChunksPerRun: 10,
  reorgLookbackBlocks: 100,
});

class BlockchainTransactionIndexerService {
  constructor({ settingRepository, repository, checkpointRepository, transactionService, config = env.blockchain, dependencies = {} }) {
    this.settingRepository = settingRepository;
    this.repository = repository;
    this.checkpointRepository = checkpointRepository;
    this.transactionService = transactionService;
    this.config = config;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url));
    this.tokenInterface = dependencies.tokenInterface || new ethers.Interface(TOKEN_ABI);
    this.transferTopic = this.tokenInterface.getEvent('Transfer').topicHash;
    this.leaseOwner = `${os.hostname()}:${process.pid}:${randomUUID()}`;
  }

  async setting(key) { return (await this.settingRepository.findByKey(key))?.settingValue; }
  async number(key, fallback) {
    const value = Number(await this.setting(key));
    return Number.isFinite(value) ? value : fallback;
  }
  async boolean(key, fallback) {
    const value = await this.setting(key);
    return value === undefined ? fallback : String(value).toLowerCase() === 'true';
  }

  async candidates(provider, tokens, fromBlock, toBlock, addressBatchSize) {
    const candidates = new Map();
    const paymentAddress = this.transactionService.paymentAddress();
    const controllerAddresses = new Set(tokens
      .map((token) => token.tokenAgentWalletAddress)
      .filter(ethers.isAddress)
      .map((address) => ethers.getAddress(address)));
    // Include the current default even before the first token using it has been deployed.
    controllerAddresses.add(this.transactionService.controllerAddress());
    const paymentLogs = await provider.getLogs({
      address: paymentAddress,
      topics: [this.transferTopic],
      fromBlock,
      toBlock,
    });
    for (const log of paymentLogs) {
      const hash = log.transactionHash.toLowerCase();
      if (candidates.has(hash)) continue;
      // Filtering by the outer target prevents unrelated USDT transfers from entering verification.
      // eslint-disable-next-line no-await-in-loop
      const tx = await provider.getTransaction(hash);
      if (tx && [...controllerAddresses].some((address) => sameAddress(tx.to, address))) {
        candidates.set(hash, { txHash: hash });
      }
    }

    for (let offset = 0; offset < tokens.length; offset += addressBatchSize) {
      const batch = tokens.slice(offset, offset + addressBatchSize);
      if (!batch.length) continue;
      // eslint-disable-next-line no-await-in-loop
      // eslint-disable-next-line no-await-in-loop
      const tokenCandidates = await this.tokenCandidates(provider, batch, fromBlock, toBlock);
      for (const candidate of tokenCandidates) candidates.set(candidate.txHash, candidate);
    }
    return [...candidates.values()];
  }

  async tokenCandidates(provider, tokens, fromBlock, toBlock) {
    if (!tokens.length || fromBlock > toBlock) return [];
    const logs = await provider.getLogs({
      address: tokens.map((token) => token.tokenAddress), topics: [this.transferTopic], fromBlock, toBlock,
    });
    const candidates = new Map();
    for (const log of logs) {
      let parsed;
      try { parsed = this.tokenInterface.parseLog(log); } catch { continue; }
      const from = parsed.args[0];
      const to = parsed.args[1];
      const token = tokens.find((item) => sameAddress(item.tokenAddress, log.address));
      if (!token) continue;
      const expectedAction = sameAddress(from, ethers.ZeroAddress)
        ? 'INVEST' : sameAddress(to, ethers.ZeroAddress) ? 'REDEMPTION' : 'TRANSFER';
      candidates.set(log.transactionHash.toLowerCase(), {
        txHash: log.transactionHash.toLowerCase(), expectedAction, tokenUid: token.tokenUid,
      });
    }
    return [...candidates.values()];
  }

  async synchronizeCandidates(candidates, chainId, stats) {
    for (const candidate of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await this.transactionService.synchronize({ chainId, ...candidate });
        const status = String(result?.status || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(stats, status)) stats[status] += 1;
      } catch (error) {
        stats.errors += 1;
        logger.warn('Canonical transaction candidate could not be synchronized', {
          txHash: candidate.txHash, code: error.code, error: error.message,
        });
        // Definitive 4xx mismatches are unrelated/unsupported chain activity and can be skipped.
        // RPC, reorg, and database failures must abort the chunk so its checkpoint is never lost.
        if (!Number.isInteger(error.statusCode) || error.statusCode >= 500 || error.code === 'CHAIN_REORGANIZATION') {
          throw error;
        }
      }
    }
  }

  async backfillNewContracts(provider, tokens, checkpointBlock, chainId, blockOffset, stats) {
    if (checkpointBlock <= 0 || typeof this.repository.registerIndexedTokens !== 'function') return;
    await this.repository.registerIndexedTokens(INDEXER_NAME, chainId, tokens);
    const pending = await this.repository.listContractsRequiringBackfill(INDEXER_NAME, chainId, checkpointBlock);
    for (const contract of pending) {
      const token = tokens.find((item) => sameAddress(item.tokenAddress, contract.contractAddress));
      if (!token) continue;
      const fromBlock = Math.max(Number(contract.startBlock), Number(contract.lastBackfilledBlock) + 1);
      const toBlock = Math.min(checkpointBlock, fromBlock + blockOffset - 1);
      // eslint-disable-next-line no-await-in-loop
      const candidates = await this.tokenCandidates(provider, [token], fromBlock, toBlock);
      stats.candidatesFound += candidates.length;
      // eslint-disable-next-line no-await-in-loop
      await this.synchronizeCandidates(candidates, chainId, stats);
      // eslint-disable-next-line no-await-in-loop
      await this.repository.advanceContractBackfill(contract.indexedContractUid, toBlock, toBlock >= checkpointBlock);
      stats.backfillBlocksScanned += toBlock - fromBlock + 1;
    }
  }

  async handleReorg(provider, checkpoint, chainId, startBlock) {
    if (!Number(checkpoint.lastIndexedBlock) || !checkpoint.lastIndexedBlockHash) return checkpoint;
    const block = await provider.getBlock(Number(checkpoint.lastIndexedBlock));
    if (block && sameAddress(block.hash, checkpoint.lastIndexedBlockHash)) return checkpoint;
    const lookback = Math.max(1, await this.number(SETTING_KEYS.reorgLookbackBlocks, DEFAULTS.reorgLookbackBlocks));
    const rewindTo = Math.max(Number(startBlock), Number(checkpoint.lastIndexedBlock) - lookback);
    await this.repository.markOrphanedFromBlock(chainId, rewindTo + 1);
    const rewindBlock = await provider.getBlock(rewindTo);
    const advanced = await this.checkpointRepository.advanceCheckpoint(
      INDEXER_NAME, chainId, this.leaseOwner, rewindTo, rewindBlock?.hash || null,
    );
    if (!advanced) throw new Error('Canonical transaction indexer lost its lease during reorg rewind.');
    logger.warn('Canonical transaction indexer rewound a non-canonical checkpoint', { chainId, rewindTo });
    return { ...checkpoint, lastIndexedBlock: rewindTo, lastIndexedBlockHash: rewindBlock?.hash || null };
  }

  async run() {
    const stats = {
      enabled: true, leaseAcquired: true, blocksScanned: 0, candidatesFound: 0,
      backfillBlocksScanned: 0, confirmed: 0, submitted: 0, failed: 0, errors: 0,
    };
    if (!this.config.transactionIndexerEnabled || !(await this.boolean(SETTING_KEYS.enabled, true))) {
      return { ...stats, enabled: false };
    }
    if (!this.config.sepoliaRpcUrl) return { ...stats, enabled: false };
    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    let leased = false;
    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      if (chainId !== Number(this.config.chainId)) throw new Error(`Transaction indexer RPC is connected to chain ${chainId}.`);
      const tokens = await this.repository.listIndexedTokens();
      if (!tokens.length) return { ...stats, tokenCount: 0 };
      const latestBlock = Number(await provider.getBlockNumber());
      const confirmations = Math.max(1, await this.number(
        SETTING_KEYS.confirmationBlocks,
        this.config.transactionIndexerConfirmations || DEFAULTS.confirmationBlocks,
      ));
      const safeBlock = Math.max(0, latestBlock - confirmations + 1);
      const earliestTokenBlock = tokens
        .map((token) => Number(token.deployedAtBlock || 0))
        .filter((block) => block > 0)
        .sort((left, right) => left - right)[0];
      const configuredStart = Number(this.config.transactionIndexerStartBlock || 0);
      const startBlock = configuredStart || earliestTokenBlock || safeBlock;
      await this.checkpointRepository.ensureCheckpoint(INDEXER_NAME, chainId, startBlock);
      const leaseSeconds = Math.max(10, await this.number(SETTING_KEYS.leaseSeconds, DEFAULTS.leaseSeconds));
      leased = await this.checkpointRepository.acquireLease(INDEXER_NAME, chainId, this.leaseOwner, leaseSeconds);
      if (!leased) return { ...stats, leaseAcquired: false };
      let checkpoint = await this.checkpointRepository.findCheckpoint(INDEXER_NAME, chainId);
      checkpoint = await this.handleReorg(provider, checkpoint, chainId, startBlock);
      let fromBlock = Number(checkpoint.lastIndexedBlock) > 0
        ? Number(checkpoint.lastIndexedBlock) + 1
        : Number(checkpoint.startBlock);
      const blockOffset = Math.max(1, await this.number(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset));
      const addressBatchSize = Math.max(1, await this.number(SETTING_KEYS.addressBatchSize, DEFAULTS.addressBatchSize));
      const maxChunks = Math.max(1, await this.number(SETTING_KEYS.maxChunksPerRun, DEFAULTS.maxChunksPerRun));
      await this.backfillNewContracts(
        provider, tokens, Number(checkpoint.lastIndexedBlock), chainId, blockOffset, stats,
      );
      for (let chunk = 0; fromBlock <= safeBlock && chunk < maxChunks; chunk += 1) {
        const toBlock = Math.min(safeBlock, fromBlock + blockOffset - 1);
        // eslint-disable-next-line no-await-in-loop
        const candidates = await this.candidates(provider, tokens, fromBlock, toBlock, addressBatchSize);
        stats.candidatesFound += candidates.length;
        // eslint-disable-next-line no-await-in-loop
        await this.synchronizeCandidates(candidates, chainId, stats);
        const block = await provider.getBlock(toBlock);
        const advanced = await this.checkpointRepository.advanceCheckpoint(
          INDEXER_NAME, chainId, this.leaseOwner, toBlock, block?.hash || null,
        );
        if (!advanced) throw new Error('Canonical transaction indexer lost its lease before checkpoint advancement.');
        stats.blocksScanned += toBlock - fromBlock + 1;
        fromBlock = toBlock + 1;
      }
      await this.checkpointRepository.releaseLease(INDEXER_NAME, chainId, this.leaseOwner);
      leased = false;
      logger.info('Canonical transaction indexer run completed', { ...stats, chainId, safeBlock, tokenCount: tokens.length });
      return { ...stats, chainId, safeBlock, tokenCount: tokens.length };
    } catch (error) {
      if (leased) {
        try { await this.checkpointRepository.releaseLease(INDEXER_NAME, Number(this.config.chainId), this.leaseOwner, error.message); } catch {}
      }
      throw error;
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }
}

module.exports = { BlockchainTransactionIndexerService, INDEXER_NAME, SETTING_KEYS, DEFAULTS };
