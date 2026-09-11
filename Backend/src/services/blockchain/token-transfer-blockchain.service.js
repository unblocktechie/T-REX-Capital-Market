const ethers = require('ethers');
const { env } = require('../../core/config/env');

const TOKEN_TRANSFER_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function getFrozenTokens(address userAddress) view returns (uint256)',
  'function paused() view returns (bool)',
  'function identityRegistry() view returns (address)',
  'function compliance() view returns (address)',
  'function transfer(address to,uint256 amount) returns (bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
];

const IDENTITY_REGISTRY_ABI = [
  'function contains(address userAddress) view returns (bool)',
  'function isVerified(address userAddress) view returns (bool)',
  'function identity(address userAddress) view returns (address)',
];

// ERC-3643 modular compliance. The T-REX token itself exposes no canTransfer(); the module rules
// (country limits, max holders, etc.) live on the compliance contract, whose canTransfer returns a
// single bool (this is NOT the ERC-1400 (bool,bytes1,bytes32) shape).
const MODULAR_COMPLIANCE_ABI = [
  'function canTransfer(address from,address to,uint256 amount) view returns (bool)',
];

class TokenTransferBlockchainError extends Error {
  constructor(code, message, { transient = false, pending = false } = {}) {
    super(message);
    this.name = 'TokenTransferBlockchainError';
    this.code = code;
    this.transient = transient;
    this.pending = pending;
  }
}

const sameAddress = (a, b) => ethers.isAddress(a) && ethers.isAddress(b)
  && ethers.getAddress(a) === ethers.getAddress(b);

const receiptFields = (receipt, log) => ({
  blockNumber: Number(receipt.blockNumber),
  blockHash: receipt.blockHash || null,
  transactionIndex: Number(receipt.index ?? receipt.transactionIndex ?? 0),
  logIndex: Number(log.index ?? log.logIndex ?? 0),
  gasUsed: receipt.gasUsed === undefined ? null : receipt.gasUsed.toString(),
  effectiveGasPrice: (receipt.gasPrice ?? receipt.effectiveGasPrice)?.toString() || null,
});

class TokenTransferBlockchainService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url));
    this.contractFactory = dependencies.contractFactory
      || ((address, abi, runner) => new ethers.Contract(address, abi, runner));
    this.tokenInterface = dependencies.tokenInterface || new ethers.Interface(TOKEN_TRANSFER_ABI);
    this.transferTopic = this.tokenInterface.getEvent('Transfer').topicHash;
  }

  confirmations() { return Math.max(1, Number(this.config.transferConfirmations || 12)); }

  async withProvider(work) {
    if (!this.config.sepoliaRpcUrl) {
      throw new TokenTransferBlockchainError('RPC_UNAVAILABLE', 'Blockchain RPC is not configured.', { transient: true });
    }
    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    try {
      const network = await provider.getNetwork().catch(() => null);
      if (!network) throw new TokenTransferBlockchainError('RPC_UNAVAILABLE', 'Could not reach the blockchain RPC.', { transient: true });
      const chainId = Number(network.chainId);
      if (chainId !== Number(this.config.chainId)) {
        throw new TokenTransferBlockchainError('WRONG_CHAIN', `RPC is connected to chain ${chainId}.`);
      }
      return await work(provider, chainId);
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async prepare(expected) {
    const addresses = [expected.tokenAddress, expected.identityRegistryAddress,
      expected.senderWalletAddress, expected.recipientWalletAddress,
      expected.senderIdentityAddress, expected.recipientIdentityAddress];
    if (!addresses.every(ethers.isAddress)) {
      throw new TokenTransferBlockchainError('TRANSFER_ADDRESSES_INVALID', 'Token transfer addresses are incomplete or invalid.');
    }
    return this.withProvider(async (provider, chainId) => {
      const token = this.contractFactory(expected.tokenAddress, TOKEN_TRANSFER_ABI, provider);
      const registry = this.contractFactory(expected.identityRegistryAddress, IDENTITY_REGISTRY_ABI, provider);
      try {
        const [decimals, senderBalance, recipientBalance, senderFrozen, paused, registryAddress,
          senderContains, recipientContains, senderVerified, recipientVerified,
          senderIdentity, recipientIdentity, preparedAtBlock] = await Promise.all([
          token.decimals(), token.balanceOf(expected.senderWalletAddress), token.balanceOf(expected.recipientWalletAddress),
          token.getFrozenTokens(expected.senderWalletAddress), token.paused(), token.identityRegistry(),
          registry.contains(expected.senderWalletAddress), registry.contains(expected.recipientWalletAddress),
          registry.isVerified(expected.senderWalletAddress), registry.isVerified(expected.recipientWalletAddress),
          registry.identity(expected.senderWalletAddress), registry.identity(expected.recipientWalletAddress),
          provider.getBlockNumber(),
        ]);
        if (!sameAddress(registryAddress, expected.identityRegistryAddress)) {
          throw new TokenTransferBlockchainError('IDENTITY_REGISTRY_MISMATCH', 'Token uses a different Identity Registry than the backend record.');
        }
        if (!senderContains || !senderVerified || !sameAddress(senderIdentity, expected.senderIdentityAddress)) {
          throw new TokenTransferBlockchainError('SENDER_NOT_VERIFIED_ONCHAIN', 'Sender is not verified in the token Identity Registry.');
        }
        if (!recipientContains || !recipientVerified || !sameAddress(recipientIdentity, expected.recipientIdentityAddress)) {
          throw new TokenTransferBlockchainError('RECIPIENT_NOT_VERIFIED_ONCHAIN', 'Recipient is not verified in the token Identity Registry.');
        }
        if (paused) throw new TokenTransferBlockchainError('TOKEN_PAUSED', 'Token transfers are currently paused.');
        // ERC-3643 compliance pre-check via the token's modular compliance contract. A read failure
        // here must not fail the intent (the on-chain transfer still enforces compliance), so it is
        // guarded — only an explicit `false` (a genuine compliance rejection) blocks the intent.
        let complianceAddress = null;
        try { complianceAddress = await token.compliance(); } catch (complianceGetterError) { complianceAddress = null; }
        if (ethers.isAddress(complianceAddress)) {
          let allowed = true;
          try {
            const compliance = this.contractFactory(complianceAddress, MODULAR_COMPLIANCE_ABI, provider);
            allowed = Boolean(await compliance.canTransfer(
              expected.senderWalletAddress, expected.recipientWalletAddress, BigInt(expected.tokenAmountRaw),
            ));
          } catch (complianceError) {
            allowed = true; // compliance unreadable -> defer to the on-chain transfer's own check
          }
          if (!allowed) {
            throw new TokenTransferBlockchainError('TRANSFER_NOT_ALLOWED', 'ERC-3643 compliance rules rejected the transfer.');
          }
        }
        const available = BigInt(senderBalance) - BigInt(senderFrozen);
        if (available < BigInt(expected.tokenAmountRaw)) {
          throw new TokenTransferBlockchainError('INSUFFICIENT_TRANSFERABLE_BALANCE', 'Token amount exceeds the sender available unfrozen balance.');
        }
        return {
          chainId,
          tokenDecimals: Number(decimals),
          senderBalanceBeforeRaw: senderBalance.toString(),
          recipientBalanceBeforeRaw: recipientBalance.toString(),
          senderFrozenBeforeRaw: senderFrozen.toString(),
          preparedAtBlock: Number(preparedAtBlock),
        };
      } catch (error) {
        if (error instanceof TokenTransferBlockchainError) throw error;
        throw new TokenTransferBlockchainError(
          'TRANSFER_STATE_UNAVAILABLE',
          error.shortMessage || error.message || 'Could not read token transfer prerequisites.',
          { transient: true },
        );
      }
    });
  }

  assertConfirmations(latestBlock, receiptBlock, required = this.confirmations()) {
    const count = Math.max(0, Number(latestBlock) - Number(receiptBlock) + 1);
    if (count < Math.max(1, Number(required))) {
      throw new TokenTransferBlockchainError(
        'INSUFFICIENT_CONFIRMATIONS',
        `Transaction has ${count} confirmation(s); ${required} required.`,
        { pending: true },
      );
    }
  }

  async assertCanonical(provider, receipt) {
    let block;
    try { block = await provider.getBlock(receipt.blockNumber); } catch {
      throw new TokenTransferBlockchainError('RPC_UNAVAILABLE', 'Could not verify the canonical transaction block.', { transient: true });
    }
    if (!block || !receipt.blockHash || String(block.hash).toLowerCase() !== String(receipt.blockHash).toLowerCase()) {
      throw new TokenTransferBlockchainError('CHAIN_REORGANIZATION', 'Transaction block is no longer canonical.', { pending: true });
    }
  }

  async verify(txHash, expected, { confirmations = this.confirmations() } = {}) {
    if (!ethers.isHexString(txHash, 32)) {
      throw new TokenTransferBlockchainError('INVALID_TRANSFER_TX_HASH', 'Transfer transaction hash is invalid.');
    }
    return this.withProvider(async (provider, chainId) => {
      let tx; let receipt;
      try {
        [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]);
      } catch {
        throw new TokenTransferBlockchainError('RPC_UNAVAILABLE', 'Could not fetch the transfer transaction.', { transient: true });
      }
      if (!tx || !receipt) {
        throw new TokenTransferBlockchainError('TRANSACTION_NOT_FOUND', 'Transfer transaction is not yet available.', { pending: true });
      }
      if (tx.chainId !== undefined && Number(tx.chainId) !== chainId) {
        throw new TokenTransferBlockchainError('WRONG_TRANSACTION_CHAIN', 'Transfer transaction belongs to another chain.');
      }
      if (!sameAddress(tx.to, expected.tokenAddress)) {
        throw new TokenTransferBlockchainError('INVALID_TOKEN_CONTRACT', 'Transaction was sent to a different token contract.');
      }
      if (!sameAddress(tx.from, expected.senderWalletAddress)) {
        throw new TokenTransferBlockchainError('INVALID_TRANSFER_SENDER', 'Transaction sender does not match the stored investor wallet.');
      }
      if (BigInt(tx.value || 0) !== 0n) {
        throw new TokenTransferBlockchainError('INVALID_NATIVE_VALUE', 'Token transfer transaction must not send native currency.');
      }
      let decoded;
      try { decoded = this.tokenInterface.parseTransaction({ data: tx.data, value: tx.value }); } catch {
        throw new TokenTransferBlockchainError('INVALID_TRANSFER_FUNCTION', 'Transaction is not an ERC-20 transfer call.');
      }
      if (decoded?.name !== 'transfer'
        || !sameAddress(decoded.args[0], expected.recipientWalletAddress)
        || decoded.args[1].toString() !== String(expected.tokenAmountRaw)) {
        throw new TokenTransferBlockchainError('TRANSFER_PARAMETERS_MISMATCH', 'Transfer recipient or amount does not match the pending intent.');
      }
      if (Number(receipt.status) !== 1) {
        throw new TokenTransferBlockchainError('TRANSFER_REVERTED', 'Transfer transaction reverted on-chain.');
      }
      const latestBlock = await provider.getBlockNumber();
      this.assertConfirmations(latestBlock, receipt.blockNumber, confirmations);
      await this.assertCanonical(provider, receipt);

      let matchedLog = null;
      for (const log of receipt.logs || []) {
        if (!sameAddress(log.address, expected.tokenAddress)) continue;
        let parsed;
        try { parsed = this.tokenInterface.parseLog(log); } catch { continue; }
        if (parsed?.name === 'Transfer'
          && sameAddress(parsed.args[0], expected.senderWalletAddress)
          && sameAddress(parsed.args[1], expected.recipientWalletAddress)
          && parsed.args[2].toString() === String(expected.tokenAmountRaw)) {
          matchedLog = log;
          break;
        }
      }
      if (!matchedLog) {
        throw new TokenTransferBlockchainError('TRANSFER_EVENT_MISSING', 'Expected token Transfer event was not emitted.');
      }

      let senderBalanceAfter; let recipientBalanceAfter; let senderFrozenAfter;
      try {
        const token = this.contractFactory(expected.tokenAddress, TOKEN_TRANSFER_ABI, provider);
        [senderBalanceAfter, recipientBalanceAfter, senderFrozenAfter] = await Promise.all([
          token.balanceOf(expected.senderWalletAddress, { blockTag: receipt.blockNumber }),
          token.balanceOf(expected.recipientWalletAddress, { blockTag: receipt.blockNumber }),
          token.getFrozenTokens(expected.senderWalletAddress, { blockTag: receipt.blockNumber }),
        ]);
      } catch {
        throw new TokenTransferBlockchainError('TRANSFER_STATE_UNAVAILABLE', 'Could not verify token balances at the transfer block.', { transient: true });
      }

      return {
        chainId,
        txHash: txHash.toLowerCase(),
        ...receiptFields(receipt, matchedLog),
        senderBalanceAfterRaw: senderBalanceAfter.toString(),
        recipientBalanceAfterRaw: recipientBalanceAfter.toString(),
        senderFrozenAfterRaw: senderFrozenAfter.toString(),
      };
    });
  }

  async scanEvents(tokenAddresses, fromBlock, toBlock, addressBatchSize = 100) {
    if (!tokenAddresses.length) return [];
    return this.withProvider(async (provider, chainId) => {
      const events = [];
      const batchSize = Math.max(1, Math.trunc(addressBatchSize));
      for (let index = 0; index < tokenAddresses.length; index += batchSize) {
        const addresses = tokenAddresses.slice(index, index + batchSize);
        const logs = await provider.getLogs({
          address: addresses.length === 1 ? addresses[0] : addresses,
          topics: [this.transferTopic],
          fromBlock,
          toBlock,
        });
        for (const log of logs) {
          const parsed = this.tokenInterface.parseLog(log);
          events.push({
            chainId,
            tokenAddress: ethers.getAddress(log.address),
            fromWalletAddress: ethers.getAddress(parsed.args[0]),
            toWalletAddress: ethers.getAddress(parsed.args[1]),
            amountRaw: parsed.args[2].toString(),
            txHash: log.transactionHash.toLowerCase(),
            blockNumber: Number(log.blockNumber),
            blockHash: log.blockHash || null,
            transactionIndex: Number(log.transactionIndex || 0),
            logIndex: Number(log.index ?? log.logIndex ?? 0),
          });
        }
      }
      return events;
    });
  }

  async findEvent(expected, fromBlock, toBlock) {
    return this.withProvider(async (provider) => {
      const logs = await provider.getLogs({
        address: expected.tokenAddress,
        topics: [
          this.transferTopic,
          ethers.zeroPadValue(expected.senderWalletAddress, 32),
          ethers.zeroPadValue(expected.recipientWalletAddress, 32),
        ],
        fromBlock,
        toBlock,
      });
      const matched = logs.find((log) => {
        try { return this.tokenInterface.parseLog(log).args[2].toString() === String(expected.tokenAmountRaw); } catch { return false; }
      });
      return matched?.transactionHash?.toLowerCase() || null;
    });
  }

  async chainHead() {
    return this.withProvider(async (provider, chainId) => ({
      chainId,
      latestBlock: Number(await provider.getBlockNumber()),
    }));
  }

  async blockHash(blockNumber) {
    return this.withProvider(async (provider) => (await provider.getBlock(blockNumber))?.hash || null);
  }
}

module.exports = {
  TokenTransferBlockchainService,
  TokenTransferBlockchainError,
  TOKEN_TRANSFER_ABI,
  IDENTITY_REGISTRY_ABI,
  MODULAR_COMPLIANCE_ABI,
  sameAddress,
};
