const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ethers } = require('ethers');
const { withTransaction } = require('../../database/connection');
const { logger } = require('../common/log.service');
const { CONTROLLER_ABI, sameAddress } = require('./blockchain-transaction.service');
const { decodeManualPriceExecution } = require('./manual-price-execution');

const INDEXER_NAME = 'platformControllerPriceEvents';
const SETTING_KEYS = Object.freeze({
  enabled: 'TokenPriceIndexerEnabled',
  intervalSeconds: 'TokenPriceIndexerIntervalSeconds',
  blockOffset: 'TokenPriceIndexerBlockOffset',
  leaseSeconds: 'TokenPriceIndexerLeaseSeconds',
  maxChunksPerRun: 'TokenPriceIndexerMaxChunksPerRun',
  reorgLookbackBlocks: 'TokenPriceIndexerReorgLookbackBlocks',
});
const DEFAULTS = Object.freeze({
  intervalSeconds: 15, blockOffset: 1000, leaseSeconds: 180, maxChunksPerRun: 10, reorgLookbackBlocks: 100,
});

class TokenPriceIndexerService {
  constructor({ settingRepository, checkpointRepository, priceRepository, tokenRepository, organizationRepository,
    config, transactionRunner = withTransaction, dependencies = {} }) {
    this.settingRepository = settingRepository;
    this.checkpointRepository = checkpointRepository;
    this.priceRepository = priceRepository;
    this.tokenRepository = tokenRepository;
    this.organizationRepository = organizationRepository;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 1 }));
    this.interface = dependencies.controllerInterface || new ethers.Interface(CONTROLLER_ABI);
    this.leaseOwner = `${os.hostname()}:${process.pid}:${randomUUID()}`;
    this.rpcRetryAt = 0;
    this.rpcFailures = 0;
    this.rpcUrlIndex = 0;
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

  controllerAddresses(tokens) {
    const values = [this.config.platformControllerAddress, ...tokens.map((token) => token.tokenAgentWalletAddress)]
      .filter((address) => ethers.isAddress(address || ''))
      .map((address) => ethers.getAddress(address));
    return [...new Map(values.map((address) => [address.toLowerCase(), address])).values()];
  }

  async handleReorg(provider, checkpoint, chainId, startBlock) {
    if (!Number(checkpoint.lastIndexedBlock) || !checkpoint.lastIndexedBlockHash) return checkpoint;
    const block = await provider.getBlock(Number(checkpoint.lastIndexedBlock));
    if (block && String(block.hash).toLowerCase() === String(checkpoint.lastIndexedBlockHash).toLowerCase()) return checkpoint;
    const lookback = Math.max(1, await this.number(SETTING_KEYS.reorgLookbackBlocks, DEFAULTS.reorgLookbackBlocks));
    const rewindTo = Math.max(Number(startBlock), Number(checkpoint.lastIndexedBlock) - lookback);
    await this.priceRepository.markOrphanedFromBlock(chainId, rewindTo + 1);
    await this.organizationRepository.clearServiceWalletEventMetadataFromBlock(chainId, rewindTo + 1);
    const rewindBlock = await provider.getBlock(rewindTo);
    const advanced = await this.checkpointRepository.advanceCheckpoint(
      INDEXER_NAME, chainId, this.leaseOwner, rewindTo, rewindBlock?.hash || null,
    );
    if (!advanced) throw new Error('Token price indexer lost its lease during reorg rewind.');
    logger.warn('Token price indexer rewound a non-canonical checkpoint', { chainId, rewindTo });
    return { ...checkpoint, lastIndexedBlock: rewindTo, lastIndexedBlockHash: rewindBlock?.hash || null, reorgDetected: true };
  }

  async reconcileState(provider, tokens) {
    const priceDecimals = new Map();
    for (const token of tokens) {
      const controllerAddress = ethers.isAddress(token.tokenAgentWalletAddress || '')
        ? ethers.getAddress(token.tokenAgentWalletAddress) : ethers.getAddress(this.config.platformControllerAddress);
      const controller = new ethers.Contract(controllerAddress, CONTROLLER_ABI, provider);
      try {
        let decimals = priceDecimals.get(controllerAddress.toLowerCase());
        if (decimals === undefined) {
          // eslint-disable-next-line no-await-in-loop
          decimals = Number(await controller.PRICE_DECIMALS());
          priceDecimals.set(controllerAddress.toLowerCase(), decimals);
        }
        // eslint-disable-next-line no-await-in-loop
        const rawPrice = await controller.tokenPrice(token.tokenAddress);
        // eslint-disable-next-line no-await-in-loop
        await this.tokenRepository.updateCurrentPriceByTokenUid(token.tokenUid, ethers.formatUnits(rawPrice, decimals));
      } catch (error) {
        logger.warn('Could not reconcile token price after a chain reorganization', {
          chainId: this.config.chainId, tokenUid: token.tokenUid, error: error.message,
        });
      }
    }
    const serviceWallets = await this.organizationRepository.listServiceWalletsByChain(this.config.chainUid);
    for (const cached of serviceWallets) {
      try {
        const controller = new ethers.Contract(cached.controllerAddress, CONTROLLER_ABI, provider);
        // eslint-disable-next-line no-await-in-loop
        const address = ethers.getAddress(await controller.serviceWalletOf(cached.tokenAddress));
        // eslint-disable-next-line no-await-in-loop
        await this.organizationRepository.upsertServiceWallet({
          tokenUid: cached.tokenUid, tokenAddress: cached.tokenAddress, organizationUid: cached.organizationUid,
          chainUid: this.config.chainUid,
          chainId: this.config.chainId,
          controllerAddress: cached.controllerAddress,
          mainWalletAddress: cached.mainWalletAddress,
          serviceWalletAddress: sameAddress(address, ethers.ZeroAddress) ? null : address,
        });
      } catch (error) {
        logger.warn('Could not reconcile service wallet after a chain reorganization', {
          chainId: this.config.chainId, organizationUid: cached.organizationUid, error: error.message,
        });
      }
    }
  }

  async processPriceEvent(provider, log, parsed, controllerAddress, priceDecimals, executor) {
    const token = await this.tokenRepository.findDeployedByAddress(parsed.args.token, this.config.chainUid, executor);
    if (!token) return false;
    const assignedController = ethers.isAddress(token.tokenAgentWalletAddress || '')
      ? token.tokenAgentWalletAddress : this.config.platformControllerAddress;
    if (!sameAddress(controllerAddress, assignedController)) return false;
    const [receipt, transaction] = await Promise.all([
      provider.getTransactionReceipt(log.transactionHash),
      provider.getTransaction(log.transactionHash),
    ]);
    if (!receipt || Number(receipt.status) !== 1) return false;
    const block = await provider.getBlock(log.blockNumber);
    const newPriceRaw = parsed.args.newPrice;
    const formatted = ethers.formatUnits(newPriceRaw, priceDecimals);
    let matchedPriceUpdateUid = null;
    let submissionMode = 'INDEXED';
    if (transaction) {
      try {
        const { call } = decodeManualPriceExecution(transaction, { ...this.config, controllerAddress,
          issuerWalletAddress: token.issuerWalletAddress });
        if (sameAddress(call.args.token, token.tokenAddress) && call.args.newPrice === newPriceRaw) submissionMode = 'DIRECT';
      } catch { /* Unknown executions remain event-only history, never matched to an intent. */ }
    }
    if (transaction) {
      try {
        const call = this.interface.parseTransaction({ data: transaction.data, value: transaction.value });
        if (call?.name === 'setPriceOnBehalfOf' && sameAddress(transaction.to, controllerAddress)
          && sameAddress(call.args.token, token.tokenAddress) && call.args.newPrice === newPriceRaw) {
          submissionMode = 'RELAYED';
          const pending = await this.priceRepository.findPendingByRelayCall({
            chainId: this.config.chainId,
            tokenAddress: call.args.token,
            newPriceRaw: call.args.newPrice.toString(),
            signatureDeadline: Number(call.args.deadline),
            signatureV: Number(call.args.v),
            signatureR: call.args.r,
            signatureS: call.args.s,
          }, executor);
          matchedPriceUpdateUid = pending?.priceUpdateUid || null;
        }
      } catch {}
    }
    await this.priceRepository.confirmEvent({
      chainUid: this.config.chainUid,
      chainId: this.config.chainId,
      tokenUid: token.tokenUid,
      organizationUid: token.organizationUid,
      issuerUserUid: token.issuerUserUid,
      controllerAddress,
      tokenAddress: ethers.getAddress(token.tokenAddress),
      issuerWalletAddress: ethers.getAddress(token.issuerWalletAddress),
      priceDecimals,
      oldPriceRaw: parsed.args.oldPrice.toString(),
      newPriceRaw: newPriceRaw.toString(),
      newPriceFormatted: formatted,
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash,
      transactionIndex: Number(log.transactionIndex ?? receipt.index ?? 0),
      logIndex: Number(log.index),
      gasUsed: receipt.gasUsed?.toString() || null,
      effectiveGasPrice: receipt.gasPrice?.toString() || null,
      confirmedAt: block ? new Date(Number(block.timestamp) * 1000) : new Date(),
      matchedPriceUpdateUid,
      submissionMode,
      directTransactionNonce: submissionMode === 'DIRECT' ? transaction.nonce : null,
    }, executor);
    return true;
  }

  async processServiceWalletEvent(log, parsed, controllerAddress, executor) {
    const token = await this.tokenRepository.findDeployedByAddress(parsed.args.token, this.config.chainUid, executor);
    if (!token || !sameAddress(controllerAddress, token.tokenAgentWalletAddress || this.config.platformControllerAddress)) return false;
    const record = await this.organizationRepository.upsertServiceWallet({
      tokenUid: token.tokenUid, tokenAddress: token.tokenAddress, organizationUid: token.organizationUid,
      chainUid: this.config.chainUid,
      chainId: this.config.chainId,
      controllerAddress,
      mainWalletAddress: ethers.getAddress(token.issuerWalletAddress),
      serviceWalletAddress: sameAddress(parsed.args.newServiceWallet, ethers.ZeroAddress)
        ? null : ethers.getAddress(parsed.args.newServiceWallet),
      sourceTxHash: log.transactionHash,
      sourceBlockNumber: Number(log.blockNumber),
      sourceBlockHash: log.blockHash,
      sourceLogIndex: Number(log.index),
    }, executor);
    return Boolean(record);
  }

  async processRange(provider, controllerAddresses, fromBlock, toBlock, stats) {
    const priceTopic = this.interface.getEvent('TokenPriceUpdated').topicHash;
    const walletTopic = this.interface.getEvent('ServiceWalletUpdated').topicHash;
    const logs = await provider.getLogs({
      address: controllerAddresses,
      topics: [[priceTopic, walletTopic]],
      fromBlock,
      toBlock,
    });
    const decimalsByController = new Map();
    for (const address of controllerAddresses) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const raw = await new ethers.Contract(address, CONTROLLER_ABI, provider).PRICE_DECIMALS();
        decimalsByController.set(address.toLowerCase(), Number(raw));
      } catch { decimalsByController.set(address.toLowerCase(), 6); }
    }
    for (const log of logs) {
      let parsed;
      try { parsed = this.interface.parseLog(log); } catch { continue; }
      // Keep each event's history row and cache update atomic. The checkpoint is advanced only
      // after every event in this range succeeds, so a crash safely replays the idempotent range.
      // eslint-disable-next-line no-await-in-loop
      const processed = await this.transactionRunner(async (connection) => {
        if (parsed.name === 'TokenPriceUpdated') {
          return this.processPriceEvent(
            provider, log, parsed, ethers.getAddress(log.address),
            decimalsByController.get(log.address.toLowerCase()) || 6, connection,
          );
        }
        return this.processServiceWalletEvent(log, parsed, ethers.getAddress(log.address), connection);
      });
      stats.eventsFound += 1;
      if (processed) stats.eventsApplied += 1;
      else stats.eventsSkipped += 1;
    }
  }

  async reconcileSubmitted(provider, safeBlock, stats) {
    const submitted = await this.priceRepository.listSubmitted(this.config.chainId, 100);
    for (const record of submitted) {
      // eslint-disable-next-line no-await-in-loop
      const receipt = await provider.getTransactionReceipt(record.transactionHash);
      if (!receipt || Number(receipt.blockNumber) > Number(safeBlock)) continue;
      // Known hashes do not depend on the historical scan checkpoint.
      const block = await provider.getBlock(receipt.blockNumber);
      if (!block || !sameAddress(block.hash, receipt.blockHash)) continue;
      const tx = await provider.getTransaction(record.transactionHash);
      if (!tx || Number(tx.chainId) !== Number(this.config.chainId)) continue;
      let call;
      try {
        if (record.submissionMode === 'DIRECT') {
          ({ call } = decodeManualPriceExecution(tx, { ...this.config,
            controllerAddress: record.controllerAddress, issuerWalletAddress: record.issuerWalletAddress }));
          if (Number(tx.nonce) !== Number(record.directTransactionNonce)) continue;
        } else {
          if (!sameAddress(tx.to, record.controllerAddress) || BigInt(tx.value || 0) !== 0n) continue;
          call = this.interface.parseTransaction({ data: tx.data });
          if (call?.name !== 'setPriceOnBehalfOf'
            || String(call.args.deadline) !== String(record.signatureDeadline)
            || Number(call.args.v) !== Number(record.signatureV)
            || !sameAddress(call.args.r, record.signatureR) || !sameAddress(call.args.s, record.signatureS)) continue;
        }
        if (!sameAddress(call.args.token, record.tokenAddress) || String(call.args.newPrice) !== String(record.newPriceRaw)) continue;
      } catch { continue; }
      if (Number(receipt.status) !== 1) {
        // eslint-disable-next-line no-await-in-loop
        await this.priceRepository.markFailed(
          record.priceUpdateUid, 'PRICE_TRANSACTION_REVERTED', 'The relayed token price transaction reverted on-chain.',
        );
        stats.failed += 1;
        continue;
      }
      const matches = (receipt.logs || []).flatMap(log => {
        if (!sameAddress(log.address, record.controllerAddress)) return [];
        try {
          const parsed = this.interface.parseLog(log);
          return parsed?.name === 'TokenPriceUpdated' && sameAddress(parsed.args.token, record.tokenAddress)
            && String(parsed.args.newPrice) === String(record.newPriceRaw) ? [{ log, parsed }] : [];
        } catch { return []; }
      });
      if (matches.length !== 1) {
        // eslint-disable-next-line no-await-in-loop
        await this.priceRepository.markFailed(
          record.priceUpdateUid, 'TOKEN_PRICE_EVENT_MISSING',
          'The transaction succeeded but the expected TokenPriceUpdated event was not indexed.',
        );
        stats.failed += 1;
        continue;
      }
      const { log, parsed } = matches[0];
      await this.transactionRunner(connection => this.priceRepository.confirmEvent({
        ...record, matchedPriceUpdateUid: record.priceUpdateUid,
        oldPriceRaw: parsed.args.oldPrice.toString(),
        newPriceFormatted: ethers.formatUnits(parsed.args.newPrice, Number(record.priceDecimals)),
        blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        transactionIndex: receipt.index, logIndex: log.index,
        gasUsed: receipt.gasUsed?.toString(), effectiveGasPrice: receipt.gasPrice?.toString(),
        confirmedAt: new Date(Number(block.timestamp) * 1000),
      }, connection));
      stats.eventsApplied += 1;
    }
  }

  async run() {
    const stats = {
      enabled: true, leaseAcquired: true, blocksScanned: 0, eventsFound: 0,
      eventsApplied: 0, eventsSkipped: 0, failed: 0,
    };
    if (!this.config.transactionIndexerEnabled || !(await this.boolean(SETTING_KEYS.enabled, true))) {
      return { ...stats, enabled: false };
    }
    // Cleanup must work even during RPC outages or RPC backoff.
    await this.priceRepository.expireUnsignedPending(this.config.chainId);
    if (Date.now() < this.rpcRetryAt) return { ...stats, leaseAcquired: false, rpcBackoff: true };
    const urls = [...new Set([this.config.rpcUrl, ...(this.config.fallbackRpcUrls || [])].filter(Boolean))];
    const provider = this.providerFactory(urls[this.rpcUrlIndex % urls.length]);
    let leased = false;
    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      if (chainId !== Number(this.config.chainId)) throw new Error(`Token price indexer RPC is connected to chain ${chainId}.`);
      const tokens = await this.tokenRepository.listDeployedByChainUid(this.config.chainUid);
      const controllers = this.controllerAddresses(tokens);
      if (!controllers.length) return { ...stats, enabled: false, controllerCount: 0 };
      const latestBlock = Number(await provider.getBlockNumber());
      const safeBlock = Math.max(0, latestBlock - Math.max(1, Number(this.config.confirmations || 2)) + 1);
      const earliestTokenBlock = tokens.map((token) => Number(token.deployedAtBlock || 0)).filter(Boolean).sort((a, b) => a - b)[0];
      const startBlock = Number(this.config.transactionIndexerStartBlock || earliestTokenBlock || safeBlock);
      await this.checkpointRepository.ensureCheckpoint(INDEXER_NAME, chainId, startBlock);
      const leaseSeconds = Math.max(10, await this.number(SETTING_KEYS.leaseSeconds, DEFAULTS.leaseSeconds));
      leased = await this.checkpointRepository.acquireLease(INDEXER_NAME, chainId, this.leaseOwner, leaseSeconds);
      if (!leased) return { ...stats, leaseAcquired: false };
      // Recover recent known transactions before potentially slow/rate-limited log scans.
      await this.reconcileSubmitted(provider, safeBlock, stats);
      let checkpoint = await this.checkpointRepository.findCheckpoint(INDEXER_NAME, chainId);
      checkpoint = await this.handleReorg(provider, checkpoint, chainId, startBlock);
      if (checkpoint.reorgDetected) await this.reconcileState(provider, tokens);
      let fromBlock = Number(checkpoint.lastIndexedBlock) > 0
        ? Number(checkpoint.lastIndexedBlock) + 1 : Number(checkpoint.startBlock);
      const offset = Math.max(1, await this.number(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset));
      const maxChunks = Math.max(1, await this.number(SETTING_KEYS.maxChunksPerRun, DEFAULTS.maxChunksPerRun));
      for (let chunk = 0; fromBlock <= safeBlock && chunk < maxChunks; chunk += 1) {
        const toBlock = Math.min(safeBlock, fromBlock + offset - 1);
        // eslint-disable-next-line no-await-in-loop
        await this.processRange(provider, controllers, fromBlock, toBlock, stats);
        // eslint-disable-next-line no-await-in-loop
        const block = await provider.getBlock(toBlock);
        // eslint-disable-next-line no-await-in-loop
        const advanced = await this.checkpointRepository.advanceCheckpoint(
          INDEXER_NAME, chainId, this.leaseOwner, toBlock, block?.hash || null,
        );
        if (!advanced) throw new Error('Token price indexer lost its lease before checkpoint advancement.');
        stats.blocksScanned += toBlock - fromBlock + 1;
        fromBlock = toBlock + 1;
      }
      await this.checkpointRepository.releaseLease(INDEXER_NAME, chainId, this.leaseOwner);
      leased = false;
      this.rpcFailures = 0;
      this.rpcRetryAt = 0;
      logger.info('Token price indexer run completed', { ...stats, chainId, safeBlock, controllerCount: controllers.length });
      return { ...stats, chainId, safeBlock, controllerCount: controllers.length };
    } catch (error) {
      if (/too many requests|429|rate.limit|missing response|timeout|SERVER_ERROR|NETWORK_ERROR/i.test(String(error.message))) {
        this.rpcFailures += 1;
        this.rpcRetryAt = Date.now() + Math.min(300000, 15000 * (2 ** Math.min(this.rpcFailures, 5)));
        this.rpcUrlIndex = (this.rpcUrlIndex + 1) % urls.length;
      }
      if (leased) {
        try { await this.checkpointRepository.releaseLease(INDEXER_NAME, this.config.chainId, this.leaseOwner, error.message); } catch {}
      }
      throw error;
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }
}

module.exports = { TokenPriceIndexerService, INDEXER_NAME, SETTING_KEYS, DEFAULTS };
