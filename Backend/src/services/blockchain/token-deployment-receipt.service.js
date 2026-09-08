const ethers = require('ethers');
const { env } = require('../../core/config/env');

const trexFactoryEventAbi = [
  'event TREXSuiteDeployed(address indexed _token, address _ir, address _irs, address _tir, address _ctr, address _mc, string indexed _salt)',
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
  if (!config.sepoliaRpcUrl) throw new Error('Missing blockchain configuration: SEPOLIA_RPC_URL.');
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

class TokenDeploymentReceiptService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory
      || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.factoryInterface = dependencies.factoryInterface || new ethers.Interface(trexFactoryEventAbi);
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
  requireConfiguration,
};
