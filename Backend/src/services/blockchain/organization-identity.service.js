const ethers = require('ethers');
const { contracts } = require('@onchain-id/solidity');
const { env } = require('../../core/config/env');

const zeroAddress = ethers.ZeroAddress.toLowerCase();

const requireConfiguration = (config) => {
  const missing = [];
  if (!config.sepoliaRpcUrl) missing.push('SEPOLIA_RPC_URL');
  if (!config.deployerPrivateKey) missing.push('DEPLOYER_PRIVATE_KEY');
  if (!config.identityFactoryAddress) missing.push('IDENTITY_FACTORY_ADDRESS');
  if (!config.idFactoryAccessManagerAddress) missing.push('ID_FACTORY_ACCESS_MANAGER_ADDRESS');
  if (missing.length) {
    throw new Error(`Missing blockchain configuration: ${missing.join(', ')}.`);
  }
  if (!ethers.isAddress(config.identityFactoryAddress)) {
    throw new Error('IDENTITY_FACTORY_ADDRESS is not a valid EVM address.');
  }
  if (!ethers.isAddress(config.idFactoryAccessManagerAddress)
    || config.idFactoryAccessManagerAddress.toLowerCase() === zeroAddress) {
    throw new Error('ID_FACTORY_ACCESS_MANAGER_ADDRESS is not a valid non-zero EVM address.');
  }
  if (!Number.isInteger(config.confirmations) || config.confirmations < 1) {
    throw new Error('BLOCKCHAIN_CONFIRMATIONS must be an integer of at least 1.');
  }
  if (!Number.isInteger(config.transactionTimeoutMs) || config.transactionTimeoutMs < 1000) {
    throw new Error('BLOCKCHAIN_TRANSACTION_TIMEOUT_MS must be at least 1000.');
  }
};

class OrganizationIdentityService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory
      || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.walletFactory = dependencies.walletFactory
      || ((privateKey, provider) => new ethers.Wallet(privateKey, provider));
    this.contractFactory = dependencies.contractFactory
      || ((address, signer) => new ethers.Contract(address, contracts.Factory.abi, signer));
  }

  async createOrganizationIdentity(orgWalletAddress, salt, configOverride = null) {
    if (!ethers.isAddress(orgWalletAddress)) {
      throw new Error(`Invalid organization wallet address: ${orgWalletAddress || 'missing'}.`);
    }
    if (!String(salt || '').trim()) throw new Error('Organization identity salt is required.');
    const config = configOverride || this.config;
    requireConfiguration(config);

    let provider;
    let transactionHash = null;
    try {
      provider = this.providerFactory(config.sepoliaRpcUrl);
      const platform = this.walletFactory(config.deployerPrivateKey, provider);

      if (config.deployerAddress) {
        if (!ethers.isAddress(config.deployerAddress)) {
          throw new Error('DEPLOYER_ADDRESS is not a valid EVM address.');
        }
        if (platform.address.toLowerCase() !== config.deployerAddress.toLowerCase()) {
          throw new Error('DEPLOYER_ADDRESS does not match DEPLOYER_PRIVATE_KEY.');
        }
      }

      // The factory remains the authoritative read source. Identity creation is deliberately
      // routed through the chain's access manager so its authorization policy is enforced.
      // The access-manager deployment exposes the compatible Factory surface, therefore the
      // existing Factory ABI is reused for both contracts.
      const identityFactory = this.contractFactory(config.identityFactoryAddress, platform);
      const existingAddress = await identityFactory.getIdentity(orgWalletAddress);
      if (String(existingAddress).toLowerCase() !== zeroAddress) {
        return {
          identityAddress: existingAddress,
          txHash: null,
          alreadyExisted: true,
        };
      }

      const accessManager = this.contractFactory(config.idFactoryAccessManagerAddress, platform);
      const transaction = await accessManager.createIdentity(orgWalletAddress, salt);
      transactionHash = transaction.hash || null;
      const receipt = await transaction.wait(
        config.confirmations,
        config.transactionTimeoutMs,
      );
      if (!receipt || Number(receipt.status) !== 1) {
        throw new Error('Identity creation transaction was not successful.');
      }

      const identityAddress = await identityFactory.getIdentity(orgWalletAddress);
      if (String(identityAddress).toLowerCase() === zeroAddress) {
        throw new Error('Identity transaction was confirmed, but the factory returned the zero address.');
      }

      return {
        identityAddress,
        txHash: receipt.hash || transactionHash,
        blockNumber: receipt.blockNumber === undefined ? null : Number(receipt.blockNumber),
        blockHash: receipt.blockHash || null,
        alreadyExisted: false,
      };
    } catch (error) {
      if (!error.transactionHash) {
        error.transactionHash = error.receipt?.hash || transactionHash;
      }
      throw error;
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }
}

module.exports = { OrganizationIdentityService, requireConfiguration };
