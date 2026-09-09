const ethers = require('ethers');
const { env } = require('../../core/config/env');

const IDENTITY_REGISTRY_ABI = [
  'function registerIdentity(address _userAddress, address _identity, uint16 _country)',
  'event IdentityRegistered(address indexed investorAddress, address indexed identity)',
  'function contains(address _userAddress) view returns (bool)',
  'function identity(address _userAddress) view returns (address)',
  'function investorCountry(address _userAddress) view returns (uint16)',
  'function isAgent(address _agent) view returns (bool)',
];

class RegistryVerificationError extends Error {
  constructor(code, message, { transient = false, pending = false } = {}) {
    super(message);
    this.name = 'RegistryVerificationError';
    this.code = code;
    this.transient = transient;
    this.pending = pending;
  }
}

const addressEqual = (left, right) => {
  if (!ethers.isAddress(left) || !ethers.isAddress(right)) return false;
  return ethers.getAddress(left) === ethers.getAddress(right);
};

class IdentityRegistryVerifierService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.contractFactory = dependencies.contractFactory
      || ((address, provider) => new ethers.Contract(address, IDENTITY_REGISTRY_ABI, provider));
    this.interface = dependencies.registryInterface || new ethers.Interface(IDENTITY_REGISTRY_ABI);
  }

  supportedChainIds() {
    const ids = Array.isArray(this.config.supportedChainIds) && this.config.supportedChainIds.length
      ? this.config.supportedChainIds : [this.config.chainId];
    return ids.map(Number).filter(Number.isInteger);
  }

  validateExpected(expected) {
    const addressFields = ['identityRegistryAddress', 'issuerWalletAddress', 'investorWalletAddress', 'investorIdentityAddress'];
    const invalid = addressFields.find((field) => !ethers.isAddress(expected[field]));
    if (invalid) throw new RegistryVerificationError('INVALID_REGISTRY_OPERATION', `Stored ${invalid} is invalid.`);
    const country = Number(expected.countryCode);
    if (!Number.isInteger(country) || country < 0 || country > 65535) {
      throw new RegistryVerificationError('INVALID_REGISTRY_OPERATION', 'Stored country code is not a valid uint16 value.');
    }
  }

  async withProvider(work) {
    if (!this.config.sepoliaRpcUrl) {
      throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Blockchain RPC is not configured.', { transient: true });
    }
    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    try {
      let network;
      try {
        network = await provider.getNetwork();
      } catch {
        throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Could not reach the blockchain RPC provider.', { transient: true });
      }
      const chainId = Number(network.chainId);
      if (!this.supportedChainIds().includes(chainId)) {
        throw new RegistryVerificationError('WRONG_CHAIN', `RPC is connected to unsupported chain ${chainId}.`);
      }
      return await work(provider, chainId);
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async getLatestBlockNumber() {
    return this.withProvider(async (provider) => Number(await provider.getBlockNumber()));
  }

  async inspectRegistryState(expected) {
    this.validateExpected(expected);
    return this.withProvider(async (provider, chainId) => {
      if (Number(expected.chainId) !== chainId) {
        throw new RegistryVerificationError('WRONG_CHAIN', `Registry operation expects chain ${expected.chainId}, not ${chainId}.`);
      }
      const registry = this.contractFactory(expected.identityRegistryAddress, provider);
      let contains;
      let identity;
      let country;
      let issuerIsAgent;
      try {
        [contains, identity, country, issuerIsAgent] = await Promise.all([
          registry.contains(expected.investorWalletAddress),
          registry.identity(expected.investorWalletAddress),
          registry.investorCountry(expected.investorWalletAddress),
          registry.isAgent(expected.issuerWalletAddress),
        ]);
      } catch {
        throw new RegistryVerificationError('REGISTRY_STATE_UNAVAILABLE', 'Could not read the expected Identity Registry state.', { transient: true });
      }
      return {
        chainId,
        contains: Boolean(contains),
        identity: String(identity),
        country: Number(country),
        issuerIsAgent: Boolean(issuerIsAgent),
        matches: Boolean(contains)
          && addressEqual(identity, expected.investorIdentityAddress)
          && Number(country) === Number(expected.countryCode),
      };
    });
  }

  async verifyRegistration({ txHash, ...expected }) {
    if (!ethers.isHexString(txHash, 32)) {
      throw new RegistryVerificationError('INVALID_TX_HASH', 'The transaction hash must be a 32-byte hexadecimal value.');
    }
    this.validateExpected(expected);
    return this.withProvider(async (provider, chainId) => {
      if (Number(expected.chainId) !== chainId) {
        throw new RegistryVerificationError('WRONG_CHAIN', `Registry operation expects chain ${expected.chainId}, not ${chainId}.`);
      }

      let transaction;
      let receipt;
      try {
        [transaction, receipt] = await Promise.all([
          provider.getTransaction(txHash), provider.getTransactionReceipt(txHash),
        ]);
      } catch {
        throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Could not fetch the registry transaction.', { transient: true });
      }
      if (!transaction || !receipt) {
        throw new RegistryVerificationError('TRANSACTION_NOT_FOUND', 'Transaction is not yet available on-chain.', { pending: true });
      }
      if (transaction.chainId !== null && transaction.chainId !== undefined && Number(transaction.chainId) !== chainId) {
        throw new RegistryVerificationError('WRONG_CHAIN', `Transaction declares chain ${transaction.chainId}, not ${chainId}.`);
      }
      if (!addressEqual(transaction.to, expected.identityRegistryAddress)) {
        throw new RegistryVerificationError('INVALID_REGISTRY_CONTRACT', 'Transaction was not sent to the expected Identity Registry.');
      }
      if (!addressEqual(transaction.from, expected.issuerWalletAddress)) {
        throw new RegistryVerificationError('UNAUTHORIZED_TRANSACTION_SENDER', 'Transaction sender is not the authorized issuer wallet.');
      }

      let decoded;
      try {
        decoded = this.interface.parseTransaction({ data: transaction.data, value: transaction.value });
      } catch {
        throw new RegistryVerificationError('INVALID_REGISTRY_FUNCTION', 'Transaction calldata is not a supported Identity Registry call.');
      }
      if (!decoded || decoded.name !== 'registerIdentity') {
        throw new RegistryVerificationError('INVALID_REGISTRY_FUNCTION', 'Transaction does not call registerIdentity.');
      }
      const userAddress = decoded.args._userAddress ?? decoded.args[0];
      const identityAddress = decoded.args._identity ?? decoded.args[1];
      const countryCode = Number(decoded.args._country ?? decoded.args[2]);
      if (!addressEqual(userAddress, expected.investorWalletAddress)
        || !addressEqual(identityAddress, expected.investorIdentityAddress)
        || countryCode !== Number(expected.countryCode)) {
        throw new RegistryVerificationError('REGISTRY_PARAMETERS_MISMATCH', 'registerIdentity parameters do not match the pending operation.');
      }
      if (Number(receipt.status) !== 1) {
        throw new RegistryVerificationError('TRANSACTION_FAILED', 'Registry transaction reverted on-chain.');
      }

      const requiredConfirmations = Math.max(1, Number(
        this.config.registryConfirmations ?? this.config.confirmations ?? 12,
      ));
      if (requiredConfirmations > 1) {
        let latestBlock;
        try {
          latestBlock = Number(await provider.getBlockNumber());
        } catch {
          throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Could not determine transaction confirmations.', { transient: true });
        }
        const confirmations = Math.max(0, latestBlock - Number(receipt.blockNumber) + 1);
        if (confirmations < requiredConfirmations) {
          throw new RegistryVerificationError(
            'INSUFFICIENT_CONFIRMATIONS',
            `Transaction has ${confirmations} confirmation(s); ${requiredConfirmations} are required.`,
            { pending: true },
          );
        }
      }

      let matchingEvent = null;
      for (const log of receipt.logs || []) {
        if (!addressEqual(log.address, expected.identityRegistryAddress)) continue;
        let parsed;
        try {
          parsed = this.interface.parseLog({ topics: [...log.topics], data: log.data });
        } catch {
          continue;
        }
        if (parsed?.name !== 'IdentityRegistered') continue;
        const investorAddress = parsed.args.investorAddress ?? parsed.args[0];
        const eventIdentity = parsed.args.identity ?? parsed.args[1];
        if (addressEqual(investorAddress, expected.investorWalletAddress)
          && addressEqual(eventIdentity, expected.investorIdentityAddress)) {
          matchingEvent = log;
          break;
        }
      }
      if (!matchingEvent) {
        throw new RegistryVerificationError('REGISTRY_EVENT_MISSING', 'Expected IdentityRegistered event was not emitted by the registry.');
      }

      const registry = this.contractFactory(expected.identityRegistryAddress, provider);
      let contains;
      let registeredIdentity;
      let registeredCountry;
      try {
        [contains, registeredIdentity, registeredCountry] = await Promise.all([
          registry.contains(expected.investorWalletAddress),
          registry.identity(expected.investorWalletAddress),
          registry.investorCountry(expected.investorWalletAddress),
        ]);
      } catch {
        throw new RegistryVerificationError('REGISTRY_STATE_UNAVAILABLE', 'Could not verify final registry state.', { transient: true });
      }
      if (!contains || !addressEqual(registeredIdentity, expected.investorIdentityAddress)
        || Number(registeredCountry) !== Number(expected.countryCode)) {
        throw new RegistryVerificationError('REGISTRY_STATE_MISMATCH', 'Final Identity Registry state does not match the pending operation.');
      }

      return {
        chainId,
        txHash: txHash.toLowerCase(),
        blockNumber: Number(receipt.blockNumber),
        blockHash: receipt.blockHash || null,
        transactionIndex: Number(receipt.index ?? receipt.transactionIndex ?? 0),
        logIndex: Number(matchingEvent.index ?? matchingEvent.logIndex ?? 0),
      };
    });
  }
}

module.exports = {
  IdentityRegistryVerifierService,
  RegistryVerificationError,
  IDENTITY_REGISTRY_ABI,
  addressEqual,
};
