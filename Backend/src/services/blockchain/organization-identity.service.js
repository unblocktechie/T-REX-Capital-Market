const ethers = require('ethers');
const { contracts } = require('@onchain-id/solidity');
const { env } = require('../../core/config/env');

const zeroAddress = ethers.ZeroAddress.toLowerCase();

const requireConfiguration = (config) => {
  const missing = [];
  if (!config.sepoliaRpcUrl) missing.push('SEPOLIA_RPC_URL');
  if (!config.deployerPrivateKey) missing.push('DEPLOYER_PRIVATE_KEY');
  if (!config.identityFactoryAddress) missing.push('IDENTITY_FACTORY_ADDRESS');
  if (missing.length) {
    throw new Error(`Missing blockchain configuration: ${missing.join(', ')}.`);
  }
  if (!ethers.isAddress(config.identityFactoryAddress)) {
    throw new Error('IDENTITY_FACTORY_ADDRESS is not a valid EVM address.');
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

  async createOrganizationIdentity(orgWalletAddress, salt) {
    if (!ethers.isAddress(orgWalletAddress)) {
      throw new Error(`Invalid organization wallet address: ${orgWalletAddress || 'missing'}.`);
    }
    if (!String(salt || '').trim()) throw new Error('Organization identity salt is required.');
    requireConfiguration(this.config);

    let provider;
    let transactionHash = null;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const platform = this.walletFactory(this.config.deployerPrivateKey, provider);

      if (this.config.deployerAddress) {
        if (!ethers.isAddress(this.config.deployerAddress)) {
          throw new Error('DEPLOYER_ADDRESS is not a valid EVM address.');
        }
        if (platform.address.toLowerCase() !== this.config.deployerAddress.toLowerCase()) {
          throw new Error('DEPLOYER_ADDRESS does not match DEPLOYER_PRIVATE_KEY.');
        }
      }

      const identityFactory = this.contractFactory(this.config.identityFactoryAddress, platform);
      const existingAddress = await identityFactory.getIdentity(orgWalletAddress);
      if (String(existingAddress).toLowerCase() !== zeroAddress) {
        return {
          identityAddress: existingAddress,
          txHash: null,
          alreadyExisted: true,
        };
      }

      const transaction = await identityFactory.createIdentity(orgWalletAddress, salt);
      transactionHash = transaction.hash || null;
      const receipt = await transaction.wait(
        this.config.confirmations,
        this.config.transactionTimeoutMs,
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
