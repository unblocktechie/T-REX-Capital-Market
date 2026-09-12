const ethers = require('ethers');
const { env } = require('../../core/config/env');

const trexFactoryEventAbi = [
  'event TREXSuiteDeployed(address indexed _token, address _ir, address _irs, address _tir, address _ctr, address _mc, string indexed _salt)',
];

// Read-only ABI for the factory's deployed-token lookup.
// tokenDeployed[salt] -> token address (zero address when nothing was deployed for that salt).
const trexFactoryReadAbi = [
  'function getToken(string _salt) view returns (address)',
];

const deploymentAddressFields = {
  _token: 'tokenAddress',
  _ir: 'identityRegistryAddress',
  _irs: 'identityRegistryStorageAddress',
  _tir: 'trustedIssuersRegistryAddress',
  _ctr: 'claimTopicsRegistryAddress',
  _mc: 'modularComplianceAddress',
};

const requireConfiguration = (config) => {
  if (!config.sepoliaRpcUrl) throw new Error('Missing blockchain configuration: BLOCKCHAIN_RPC_URL.');
  if (!config.trexFactoryAddress) throw new Error('Missing blockchain configuration: TREX_FACTORY_ADDRESS.');
  if (!ethers.isAddress(config.trexFactoryAddress)) {
    throw new Error('TREX_FACTORY_ADDRESS is not a valid EVM address.');
  }
  if (!Number.isInteger(config.confirmations) || config.confirmations < 1) {
    throw new Error('BLOCKCHAIN_CONFIRMATIONS must be an integer of at least 1.');
  }
  if (!Number.isInteger(config.transactionTimeoutMs) || config.transactionTimeoutMs < 1000) {
    throw new Error('BLOCKCHAIN_TRANSACTION_TIMEOUT_MS must be at least 1000.');
  }
};

const validDeploymentAddress = (value) => ethers.isAddress(value)
  && value.toLowerCase() !== ethers.ZeroAddress.toLowerCase();

// Reproduces the raw string salt the TREX Gateway builds:
//   Strings.toHexString(owner) + tokenName   (lowercase owner hex, exact trimmed name, no separator)
const deriveTrexDeploymentSalt = (owner, tokenName) => {
  // Accept any 0x + 40 hex address (checksummed or not) and lowercase it, matching the
  // Gateway's Strings.toHexString(owner) which always produces a lowercase hex string.
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(owner || ''))) {
    throw new Error('A valid owner address is required to derive the T-REX deployment salt.');
  }
  const normalizedName = String(tokenName || '').trim();
  if (!normalizedName) {
    throw new Error('Token name is required to derive the T-REX deployment salt.');
  }
  return `${owner.toLowerCase()}${normalizedName}`;
};

class TokenDeploymentReceiptService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory
      || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.factoryInterface = dependencies.factoryInterface || new ethers.Interface(trexFactoryEventAbi);
    this.deployedTopic = this.factoryInterface.getEvent('TREXSuiteDeployed').topicHash;
    // Injectable factory read contract (for tests).
    this.factoryReaderFactory = dependencies.factoryReaderFactory
      || ((address, provider) => new ethers.Contract(address, trexFactoryReadAbi, provider));
  }

  // Lightweight, non-blocking readiness probe used before the full verify(). Returns
  // { ready } where ready is true only once a receipt exists with enough confirmations.
  // It never waits and never throws for an un-mined transaction — that is reported as
  // ready:false so the caller can respond 202/confirming instead of blocking or failing.
  async checkConfirmation(transactionHash) {
    if (!ethers.isHexString(transactionHash, 32)) {
      throw new Error('transactionHash must be a 32-byte EVM transaction hash.');
    }
    requireConfiguration(this.config);

    let provider;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (!receipt) return { ready: false, mined: false, confirmations: 0 };

      let confirmations;
      if (typeof receipt.confirmations === 'function') {
        confirmations = Number(await receipt.confirmations());
      } else if (Number.isFinite(Number(receipt.confirmations))) {
        confirmations = Number(receipt.confirmations);
      } else {
        const head = Number(await provider.getBlockNumber());
        confirmations = Number.isSafeInteger(head) ? (head - Number(receipt.blockNumber) + 1) : 0;
      }

      return {
        ready: confirmations >= this.config.confirmations,
        mined: true,
        confirmations,
        status: Number(receipt.status),
      };
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }

  // Build the full deployment record directly from a found TREXSuiteDeployed log:
  // all six suite addresses, the deployer (tx sender), the tx hash, block and timestamp.
  // Read-only. Avoids a second verify() round-trip that could fail on confirmations.
  async buildDeploymentFromLog(provider, log) {
    const parsed = this.factoryInterface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed || parsed.name !== 'TREXSuiteDeployed') return null;

    const addresses = {};
    for (const [argument, field] of Object.entries(deploymentAddressFields)) {
      const value = parsed.args[argument];
      addresses[field] = validDeploymentAddress(value) ? ethers.getAddress(value) : null;
    }

    const blockNumber = Number(log.blockNumber);
    const deployTxHash = log.transactionHash;

    let platformAgentWallet = null;
    try {
      const tx = await provider.getTransaction(deployTxHash);
      if (tx && validDeploymentAddress(tx.from)) platformAgentWallet = ethers.getAddress(tx.from);
    } catch {
      // Non-fatal: sender is best-effort.
    }

    let deployedAt = null;
    try {
      const block = await provider.getBlock(blockNumber);
      const timestamp = Number(block && block.timestamp);
      if (Number.isSafeInteger(timestamp) && timestamp > 0) deployedAt = new Date(timestamp * 1000);
    } catch {
      // Non-fatal: fall back to server time at the call site.
    }

    return {
      platformAgentWallet,
      ...addresses,
      deployTxHash,
      deployedAtBlock: Number.isSafeInteger(blockNumber) ? blockNumber : null,
      deployedAt: deployedAt || new Date(),
    };
  }

  // Deterministic on-chain reconciliation by deployment salt. Given the token owner
  // (the approved organization wallet) and the exact token name, it derives the same
  // raw salt the Gateway used and calls factory.getToken(salt). When a token exists it
  // locates the TREXSuiteDeployed event — scanning in bounded windows, newest-first, so a
  // recent deployment is found immediately and the RPC block-range cap is never exceeded —
  // and returns the full deployment (suite addresses, tx hash, block, sender). Read-only.
  async reconcileBySalt({ owner, tokenName, fromBlock = 0, blockOffset, maxLookbackBlocks } = {}) {
    requireConfiguration(this.config);
    const rawSalt = deriveTrexDeploymentSalt(owner, tokenName);
    const saltHash = ethers.keccak256(ethers.toUtf8Bytes(rawSalt));

    const offset = Math.max(1, Number.isInteger(blockOffset)
      ? blockOffset
      : (Number(this.config.reconcileBlockOffset) || 9000));
    const lookbackCap = Number.isInteger(maxLookbackBlocks)
      ? maxLookbackBlocks
      : (Number(this.config.reconcileMaxLookbackBlocks) || 1000000);

    let provider;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const factory = this.factoryReaderFactory(this.config.trexFactoryAddress, provider);
      const tokenAddressRaw = await factory.getToken(rawSalt);
      if (!validDeploymentAddress(tokenAddressRaw)) {
        return { deployed: false, rawSalt, saltHash, tokenAddress: null, transactionHash: null, deployment: null };
      }
      const tokenAddress = ethers.getAddress(tokenAddressRaw);

      // Locate the deployment event by the indexed token address, scanning newest-first
      // in bounded windows down to a floor (configured start block, or a capped lookback).
      let deployment = null;
      let transactionHash = null;
      try {
        const tokenTopic = ethers.zeroPadValue(tokenAddress.toLowerCase(), 32);
        const latest = Number(await provider.getBlockNumber());
        const configuredFrom = Number.isInteger(fromBlock) && fromBlock > 0 ? fromBlock : 0;
        const floor = Math.max(configuredFrom, latest - lookbackCap, 0);

        let toBlock = latest;
        let foundLog = null;
        while (toBlock >= floor && !foundLog) {
          const chunkFrom = Math.max(toBlock - offset + 1, floor);
          try {
            const logs = await provider.getLogs({
              address: this.config.trexFactoryAddress,
              topics: [this.deployedTopic, tokenTopic],
              fromBlock: chunkFrom,
              toBlock,
            });
            if (logs && logs.length) foundLog = logs[logs.length - 1];
          } catch {
            // Range/temporary error for this window; move to the next older window.
          }
          if (chunkFrom <= floor) break;
          toBlock = chunkFrom - 1;
        }

        if (foundLog) {
          transactionHash = foundLog.transactionHash || null;
          deployment = await this.buildDeploymentFromLog(provider, foundLog);
        }
      } catch {
        // Non-fatal: getToken already proved the token is deployed; the background sync
        // will backfill the remaining fields if the event could not be located here.
      }

      return { deployed: true, rawSalt, saltHash, tokenAddress, transactionHash, deployment };
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async verify(transactionHash) {
    if (!ethers.isHexString(transactionHash, 32)) {
      throw new Error('transactionHash must be a 32-byte EVM transaction hash.');
    }
    requireConfiguration(this.config);

    let provider;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const receipt = await provider.waitForTransaction(
        transactionHash,
        this.config.confirmations,
        this.config.transactionTimeoutMs,
      );
      if (!receipt) throw new Error('The deployment transaction was not confirmed before the verification timeout.');

      const deployTxHash = receipt.hash || transactionHash;
      const platformAgentWallet = receipt.from
        || (await provider.getTransaction(transactionHash))?.from;
      if (!validDeploymentAddress(platformAgentWallet)) {
        throw new Error('The deployment transaction sender could not be determined.');
      }
      if (Number(receipt.status) !== 1) {
        const error = new Error('The deployment transaction was mined but failed on-chain.');
        error.deployTxHash = deployTxHash;
        error.platformAgentWallet = platformAgentWallet;
        throw error;
      }

      const factoryAddress = this.config.trexFactoryAddress.toLowerCase();
      let parsedDeployment;
      for (const log of receipt.logs || []) {
        if (!log.address || log.address.toLowerCase() !== factoryAddress) continue;
        try {
          const parsed = this.factoryInterface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === 'TREXSuiteDeployed') {
            parsedDeployment = parsed;
            break;
          }
        } catch {
          // The configured factory can emit other events in the same transaction.
        }
      }
      if (!parsedDeployment) {
        const error = new Error('TREXSuiteDeployed event was not found in the transaction receipt.');
        error.deployTxHash = deployTxHash;
        error.platformAgentWallet = platformAgentWallet;
        throw error;
      }

      const addresses = {};
      for (const [argument, field] of Object.entries(deploymentAddressFields)) {
        const value = parsedDeployment.args[argument];
        if (!validDeploymentAddress(value)) {
          const error = new Error(`TREXSuiteDeployed returned an invalid or zero ${field}.`);
          error.deployTxHash = deployTxHash;
          error.platformAgentWallet = platformAgentWallet;
          throw error;
        }
        addresses[field] = ethers.getAddress(value);
      }

      const blockNumber = Number(receipt.blockNumber);
      if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) {
        throw new Error('The deployment receipt contains an invalid block number.');
      }
      const block = await provider.getBlock(receipt.blockNumber);
      const timestamp = Number(block?.timestamp);
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
        throw new Error('The deployment block timestamp could not be resolved.');
      }

      return {
        platformAgentWallet: ethers.getAddress(platformAgentWallet),
        ...addresses,
        deployTxHash,
        deployedAtBlock: blockNumber,
        deployedAt: new Date(timestamp * 1000),
      };
    } catch (error) {
      if (!error.deployTxHash) error.deployTxHash = error.receipt?.hash || transactionHash;
      if (!error.platformAgentWallet && validDeploymentAddress(error.receipt?.from)) {
        error.platformAgentWallet = error.receipt.from;
      }
      throw error;
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }
}

module.exports = {
  TokenDeploymentReceiptService,
  trexFactoryEventAbi,
  trexFactoryReadAbi,
  requireConfiguration,
  deriveTrexDeploymentSalt,
};
