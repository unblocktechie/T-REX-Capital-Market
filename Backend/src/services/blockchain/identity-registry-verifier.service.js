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

const DELEGATION_MANAGER_ABI = [
  'function redeemDelegations(bytes[] _permissionContexts, bytes32[] _modes, bytes[] _executionCallDatas)',
];
const SINGLE_EXECUTION_MODE = ethers.ZeroHash;

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
    this.delegationInterface = dependencies.delegationInterface || new ethers.Interface(DELEGATION_MANAGER_ABI);
  }

  delegationManagerAddresses() {
    const configured = Array.isArray(this.config.registryDelegationManagerAddresses)
      ? this.config.registryDelegationManagerAddresses : [];
    return new Set(configured.filter(ethers.isAddress).map((address) => ethers.getAddress(address)));
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

  async withProvider(work, { retryOnNull = false } = {}) {
    const rpcUrls = [this.config.sepoliaRpcUrl, ...(this.config.sepoliaFallbackRpcUrls || [])]
      .filter((url, index, values) => url && values.indexOf(url) === index);
    if (!rpcUrls.length) {
      throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Blockchain RPC is not configured.', { transient: true });
    }
    let lastError = null;
    let receivedNull = false;
    for (let index = 0; index < rpcUrls.length; index += 1) {
      const provider = this.providerFactory(rpcUrls[index]);
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
        const result = await work(provider, chainId);
        if (result === null && retryOnNull && index < rpcUrls.length - 1) {
          receivedNull = true;
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof RegistryVerificationError && (error.transient || error.pending);
        if (!retryable || index === rpcUrls.length - 1) throw error;
      } finally {
        if (provider && typeof provider.destroy === 'function') provider.destroy();
      }
    }
    if (receivedNull) return null;
    throw lastError || new RegistryVerificationError('RPC_UNAVAILABLE', 'Blockchain RPC providers are unavailable.', { transient: true });
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

  async findRegistrationEvent(expected, { fromBlock = 0, toBlock = null } = {}) {
    this.validateExpected(expected);
    return this.withProvider(async (provider, chainId) => {
      if (Number(expected.chainId) !== chainId) {
        throw new RegistryVerificationError('WRONG_CHAIN', `Registry operation expects chain ${expected.chainId}, not ${chainId}.`);
      }
      let latestBlock;
      try {
        latestBlock = Number(await provider.getBlockNumber());
      } catch {
        throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Could not determine the registry recovery block range.', { transient: true });
      }
      const requiredConfirmations = Math.max(1, Number(
        this.config.registryConfirmations ?? this.config.confirmations ?? 2,
      ));
      const safeLatestBlock = Math.max(0, latestBlock - requiredConfirmations + 1);
      const requestedEnd = toBlock === null ? safeLatestBlock : Math.min(safeLatestBlock, Number(toBlock));
      const lookbackBlocks = Math.max(1000, Number(this.config.registryRecoveryLookbackBlocks || 200000));
      const earliestAllowed = Math.max(0, requestedEnd - lookbackBlocks + 1);
      const requestedStart = Math.max(0, Number(fromBlock || 0));
      const start = Math.max(earliestAllowed, requestedStart);
      if (start > requestedEnd) return null;

      const event = this.interface.getEvent('IdentityRegistered');
      const topics = [
        event.topicHash,
        ethers.zeroPadValue(expected.investorWalletAddress, 32),
        ethers.zeroPadValue(expected.investorIdentityAddress, 32),
      ];
      const blockOffset = Math.max(1000, Number(this.config.registryRecoveryBlockOffset || 20000));
      const rpcAttempts = Math.max(1, Number(this.config.registryRpcEvidenceAttempts || 5));
      let hadSuccessfulQuery = false;
      let hadFailedQuery = false;
      for (let attempt = 0; attempt < rpcAttempts; attempt += 1) {
        for (let end = requestedEnd; end >= start; end -= blockOffset) {
          const beginning = Math.max(start, end - blockOffset + 1);
          let logs;
          try {
            logs = await provider.getLogs({
              address: expected.identityRegistryAddress,
              topics,
              fromBlock: beginning,
              toBlock: end,
            });
            hadSuccessfulQuery = true;
          } catch {
            hadFailedQuery = true;
            continue;
          }
          const matching = [...logs].reverse().find((log) => addressEqual(log.address, expected.identityRegistryAddress));
          if (matching) {
            return {
              chainId,
              identityRegistryAddress: ethers.getAddress(matching.address),
              investorWalletAddress: ethers.getAddress(expected.investorWalletAddress),
              investorIdentityAddress: ethers.getAddress(expected.investorIdentityAddress),
              eventName: 'IdentityRegistered',
              txHash: String(matching.transactionHash).toLowerCase(),
              blockNumber: Number(matching.blockNumber),
              blockHash: matching.blockHash || null,
              transactionIndex: Number(matching.transactionIndex ?? 0),
              logIndex: Number(matching.index ?? matching.logIndex ?? 0),
            };
          }
        }
      }
      if (!hadSuccessfulQuery || hadFailedQuery) {
        throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Could not reliably search for the existing IdentityRegistered event.', { transient: true });
      }
      return null;
    }, { retryOnNull: true });
  }

  async fetchTransactionEvidence(provider, txHash, blockNumberHint = null) {
    let transaction;
    let receipt;
    const attempts = Math.max(1, Number(this.config.registryRpcEvidenceAttempts || 5));
    for (let attempt = 0; attempt < attempts && (!transaction || !receipt); attempt += 1) {
      if (!transaction) {
        try { transaction = await provider.getTransaction(txHash); } catch { /* try block evidence below */ }
      }
      if (!receipt) {
        try { receipt = await provider.getTransactionReceipt(txHash); } catch { /* try block evidence below */ }
      }
    }

    const blockNumber = receipt?.blockNumber ?? transaction?.blockNumber ?? blockNumberHint;
    if ((!transaction || !receipt) && blockNumber !== null && blockNumber !== undefined) {
      const blockTag = ethers.toQuantity(Number(blockNumber));
      if (!transaction) {
        for (let attempt = 0; attempt < attempts && !transaction; attempt += 1) {
          try {
          const block = await provider.send('eth_getBlockByNumber', [blockTag, true]);
          const raw = (block?.transactions || []).find(
            (item) => String(item.hash).toLowerCase() === txHash.toLowerCase(),
          );
          if (raw) {
            transaction = {
              to: raw.to,
              from: raw.from,
              chainId: raw.chainId === null || raw.chainId === undefined ? null : Number(raw.chainId),
              value: raw.value || 0,
              data: raw.input || raw.data || '0x',
              blockNumber: Number(raw.blockNumber ?? blockNumber),
            };
          }
          } catch { /* another RPC attempt may succeed */ }
        }
      }
      if (!receipt) {
        for (let attempt = 0; attempt < attempts && !receipt; attempt += 1) {
          try {
          const receipts = await provider.send('eth_getBlockReceipts', [blockTag]);
          const raw = (receipts || []).find(
            (item) => String(item.transactionHash).toLowerCase() === txHash.toLowerCase(),
          );
          if (raw) {
            receipt = {
              status: Number(raw.status),
              blockNumber: Number(raw.blockNumber),
              blockHash: raw.blockHash || null,
              index: Number(raw.transactionIndex ?? 0),
              logs: (raw.logs || []).map((log) => ({
                ...log,
                index: Number(log.logIndex ?? 0),
                logIndex: Number(log.logIndex ?? 0),
              })),
            };
          }
          } catch { /* another RPC attempt may succeed */ }
        }
      }
    }
    return { transaction, receipt };
  }

  decodeRegisterIdentity(data, value, expected) {
    let decoded;
    try {
      decoded = this.interface.parseTransaction({ data, value });
    } catch {
      throw new RegistryVerificationError(
        'INVALID_REGISTRY_FUNCTION',
        'Transaction calldata is not a supported Identity Registry call.',
      );
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
      throw new RegistryVerificationError(
        'REGISTRY_PARAMETERS_MISMATCH',
        'registerIdentity parameters do not match the pending operation.',
      );
    }
  }

  decodeSingleDelegatedExecution(payload) {
    let bytes;
    try {
      bytes = ethers.getBytes(payload);
    } catch {
      throw new RegistryVerificationError('INVALID_DELEGATED_REGISTRY_CALL', 'Delegated execution payload is invalid.');
    }
    // ERC-7579 single execution encoding is target (20 bytes) + value (32 bytes) + calldata.
    if (bytes.length < 56) {
      throw new RegistryVerificationError('INVALID_DELEGATED_REGISTRY_CALL', 'Delegated execution payload is incomplete.');
    }
    return {
      target: ethers.getAddress(ethers.hexlify(bytes.slice(0, 20))),
      value: ethers.toBigInt(ethers.hexlify(bytes.slice(20, 52))),
      data: ethers.hexlify(bytes.slice(52)),
    };
  }

  verifyTransactionCall(transaction, expected) {
    let outerValue;
    try {
      outerValue = BigInt(transaction.value ?? 0);
    } catch {
      throw new RegistryVerificationError('UNEXPECTED_TRANSACTION_VALUE', 'Registry transaction value is invalid.');
    }
    if (outerValue !== 0n) {
      throw new RegistryVerificationError('UNEXPECTED_TRANSACTION_VALUE', 'Registry transaction must not send native value.');
    }

    if (addressEqual(transaction.to, expected.identityRegistryAddress)) {
      this.decodeRegisterIdentity(transaction.data, outerValue, expected);
      return 'DIRECT';
    }

    const delegationManagers = this.delegationManagerAddresses();
    if (!ethers.isAddress(transaction.to) || !delegationManagers.has(ethers.getAddress(transaction.to))) {
      throw new RegistryVerificationError('INVALID_REGISTRY_CONTRACT', 'Transaction was not sent to the expected Identity Registry or an approved delegated executor.');
    }

    let delegated;
    try {
      delegated = this.delegationInterface.parseTransaction({ data: transaction.data, value: outerValue });
    } catch {
      throw new RegistryVerificationError('INVALID_DELEGATED_REGISTRY_CALL', 'Delegated registry transaction calldata is invalid.');
    }
    if (!delegated || delegated.name !== 'redeemDelegations') {
      throw new RegistryVerificationError('INVALID_DELEGATED_REGISTRY_CALL', 'Delegated transaction does not call redeemDelegations.');
    }

    const permissionContexts = delegated.args._permissionContexts ?? delegated.args.permissionContexts ?? delegated.args[0];
    const modes = delegated.args._modes ?? delegated.args.modes ?? delegated.args[1];
    const payloads = delegated.args._executionCallDatas ?? delegated.args.executionCallDatas ?? delegated.args[2];
    if (permissionContexts.length !== 1 || modes.length !== 1 || payloads.length !== 1
      || String(modes[0]).toLowerCase() !== SINGLE_EXECUTION_MODE.toLowerCase()) {
      throw new RegistryVerificationError(
        'UNSUPPORTED_DELEGATED_REGISTRY_EXECUTION',
        'Delegated registry transaction must contain exactly one supported single execution.',
      );
    }

    const execution = this.decodeSingleDelegatedExecution(payloads[0]);
    if (!addressEqual(execution.target, expected.identityRegistryAddress)) {
      throw new RegistryVerificationError('INVALID_REGISTRY_CONTRACT', 'Delegated execution target is not the expected Identity Registry.');
    }
    if (execution.value !== 0n) {
      throw new RegistryVerificationError('UNEXPECTED_TRANSACTION_VALUE', 'Delegated registry call must not send native value.');
    }
    this.decodeRegisterIdentity(execution.data, execution.value, expected);
    return 'DELEGATED';
  }

  async verifyRegistration({ txHash, blockNumberHint = null, ...expected }) {
    if (!ethers.isHexString(txHash, 32)) {
      throw new RegistryVerificationError('INVALID_TX_HASH', 'The transaction hash must be a 32-byte hexadecimal value.');
    }
    this.validateExpected(expected);
    return this.withProvider(async (provider, chainId) => {
      if (Number(expected.chainId) !== chainId) {
        throw new RegistryVerificationError('WRONG_CHAIN', `Registry operation expects chain ${expected.chainId}, not ${chainId}.`);
      }

      const { transaction, receipt } = await this.fetchTransactionEvidence(provider, txHash, blockNumberHint);
      if (!transaction || !receipt) {
        throw new RegistryVerificationError('TRANSACTION_NOT_FOUND', 'Transaction is not yet available on-chain.', { pending: true });
      }
      if (transaction.chainId !== null && transaction.chainId !== undefined && Number(transaction.chainId) !== chainId) {
        throw new RegistryVerificationError('WRONG_CHAIN', `Transaction declares chain ${transaction.chainId}, not ${chainId}.`);
      }
      if (!addressEqual(transaction.from, expected.issuerWalletAddress)) {
        throw new RegistryVerificationError('UNAUTHORIZED_TRANSACTION_SENDER', 'Transaction sender is not the authorized issuer wallet.');
      }
      const executionType = this.verifyTransactionCall(transaction, expected);
      if (Number(receipt.status) !== 1) {
        throw new RegistryVerificationError('TRANSACTION_FAILED', 'Registry transaction reverted on-chain.');
      }

      const requiredConfirmations = Math.max(1, Number(
        this.config.registryConfirmations ?? this.config.confirmations ?? 2,
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

      let canonicalBlock;
      try {
        canonicalBlock = await provider.getBlock(Number(receipt.blockNumber));
      } catch {
        throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Could not verify the registry transaction block.', { transient: true });
      }
      if (!canonicalBlock?.hash) {
        throw new RegistryVerificationError('RPC_UNAVAILABLE', 'Registry transaction block is temporarily unavailable.', { transient: true });
      }
      if (!receipt.blockHash || String(canonicalBlock.hash).toLowerCase() !== String(receipt.blockHash).toLowerCase()) {
        throw new RegistryVerificationError('CHAIN_REORGANIZATION', 'Registry transaction block is no longer canonical.', { pending: true });
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
        executionType,
      };
    });
  }
}

module.exports = {
  IdentityRegistryVerifierService,
  RegistryVerificationError,
  IDENTITY_REGISTRY_ABI,
  DELEGATION_MANAGER_ABI,
  SINGLE_EXECUTION_MODE,
  addressEqual,
};
