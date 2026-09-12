const ethers = require('ethers');
const { env } = require('../../core/config/env');

const REDEMPTION_USDT_ABI = [
  'function decimals() view returns (uint8)',
  'function transfer(address to,uint256 amount) returns (bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
];

const REDEMPTION_TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function getFrozenTokens(address userAddress) view returns (uint256)',
  'function isAgent(address agent) view returns (bool)',
  'function freezePartialTokens(address userAddress,uint256 amount)',
  'function unfreezePartialTokens(address userAddress,uint256 amount)',
  'function burn(address userAddress,uint256 amount)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event TokensFrozen(address indexed userAddress,uint256 amount)',
  'event TokensUnfrozen(address indexed userAddress,uint256 amount)',
];

const AUTHORIZATION_TYPES = Object.freeze({
  RedemptionAuthorization: [
    { name: 'redemptionUid', type: 'string' },
    { name: 'investorWalletAddress', type: 'address' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'tokenAmountRaw', type: 'uint256' },
    { name: 'usdtAmountRaw', type: 'uint256' },
    { name: 'issuerPaymentWalletAddress', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'uint256' },
  ],
});

class RedemptionBlockchainError extends Error {
  constructor(code, message, { transient = false, pending = false } = {}) {
    super(message);
    this.name = 'RedemptionBlockchainError';
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

class TokenRedemptionBlockchainService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url));
    this.walletFactory = dependencies.walletFactory || ((key, provider) => new ethers.Wallet(key, provider));
    this.contractFactory = dependencies.contractFactory || ((address, abi, runner) => new ethers.Contract(address, abi, runner));
    this.usdtInterface = dependencies.usdtInterface || new ethers.Interface(REDEMPTION_USDT_ABI);
    this.tokenInterface = dependencies.tokenInterface || new ethers.Interface(REDEMPTION_TOKEN_ABI);
    this.transferTopic = this.usdtInterface.getEvent('Transfer').topicHash;
  }

  confirmations() { return Math.max(1, Number(this.config.redemptionConfirmations || 1)); }

  async withProvider(work) {
    if (!this.config.sepoliaRpcUrl) throw new RedemptionBlockchainError('RPC_UNAVAILABLE', 'Blockchain RPC is not configured.', { transient: true });
    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    try {
      const network = await provider.getNetwork().catch(() => null);
      if (!network) throw new RedemptionBlockchainError('RPC_UNAVAILABLE', 'Could not reach the blockchain RPC.', { transient: true });
      const chainId = Number(network.chainId);
      if (chainId !== Number(this.config.chainId)) throw new RedemptionBlockchainError('WRONG_CHAIN', `RPC is connected to chain ${chainId}.`);
      return await work(provider, chainId);
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  platformWalletAddress() {
    if (!ethers.isAddress(this.config.platformControllerAddress || '')) {
      throw new RedemptionBlockchainError('PLATFORM_CONTROLLER_NOT_CONFIGURED', 'Platform Controller is not configured.');
    }
    return ethers.getAddress(this.config.platformControllerAddress);
  }

  async prepare({ usdtContractAddress, tokenAddress, investorWalletAddress }) {
    if (![usdtContractAddress, tokenAddress, investorWalletAddress].every(ethers.isAddress)) {
      throw new RedemptionBlockchainError('REDEMPTION_ADDRESSES_INVALID', 'Redemption blockchain addresses are invalid.');
    }
    const platformWalletAddress = this.platformWalletAddress();
    return this.withProvider(async (provider, chainId) => {
      const usdt = this.contractFactory(usdtContractAddress, REDEMPTION_USDT_ABI, provider);
      const token = this.contractFactory(tokenAddress, REDEMPTION_TOKEN_ABI, provider);
      try {
        const [usdtDecimals, balance, frozen, totalSupply, isAgent, preparedAtBlock] = await Promise.all([
          usdt.decimals(), token.balanceOf(investorWalletAddress), token.getFrozenTokens(investorWalletAddress),
          token.totalSupply(), token.isAgent(platformWalletAddress), provider.getBlockNumber(),
        ]);
        return {
          chainId, usdtDecimals: Number(usdtDecimals), balanceBeforeRaw: balance.toString(),
          frozenBeforeRaw: frozen.toString(), totalSupplyBeforeRaw: totalSupply.toString(),
          platformWalletAddress, platformIsAgent: Boolean(isAgent), preparedAtBlock: Number(preparedAtBlock),
        };
      } catch (error) {
        if (error instanceof RedemptionBlockchainError) throw error;
        throw new RedemptionBlockchainError('REDEMPTION_STATE_UNAVAILABLE', 'Could not read redemption prerequisites.', { transient: true });
      }
    });
  }

  authorizationPayload(row) {
    const deadline = Math.floor(new Date(row.authorizationDeadline).getTime() / 1000);
    return {
      domain: {
        name: 'T-REX Capital Market Redemption', version: '1', chainId: Number(row.chainId),
        verifyingContract: ethers.getAddress(row.tokenAddress),
      },
      types: AUTHORIZATION_TYPES,
      primaryType: 'RedemptionAuthorization',
      message: {
        redemptionUid: row.redemptionUid,
        investorWalletAddress: ethers.getAddress(row.investorWalletAddress),
        tokenAddress: ethers.getAddress(row.tokenAddress),
        tokenAmountRaw: String(row.tokenAmountRaw), usdtAmountRaw: String(row.usdtAmountRaw),
        issuerPaymentWalletAddress: ethers.getAddress(row.issuerPaymentWalletAddress),
        nonce: row.authorizationNonce, deadline,
      },
    };
  }

  verifyAuthorization(row, signature) {
    if (!ethers.isHexString(signature) || ethers.dataLength(signature) !== 65) {
      throw new RedemptionBlockchainError('INVALID_AUTHORIZATION_SIGNATURE', 'Redemption authorization signature is invalid.');
    }
    if (new Date(row.authorizationDeadline).getTime() <= Date.now()) {
      throw new RedemptionBlockchainError('AUTHORIZATION_EXPIRED', 'Redemption authorization has expired.');
    }
    const payload = this.authorizationPayload(row);
    let recovered;
    try { recovered = ethers.verifyTypedData(payload.domain, payload.types, payload.message, signature); } catch {
      throw new RedemptionBlockchainError('INVALID_AUTHORIZATION_SIGNATURE', 'Redemption authorization signature could not be verified.');
    }
    if (!sameAddress(recovered, row.investorWalletAddress)) {
      throw new RedemptionBlockchainError('AUTHORIZATION_SIGNER_MISMATCH', 'Authorization was not signed by the registered investor wallet.');
    }
    return { signature: signature.toLowerCase(), signer: ethers.getAddress(recovered), payload };
  }

  assertConfirmations(latestBlock, receiptBlock, required = this.confirmations()) {
    const count = Math.max(0, Number(latestBlock) - Number(receiptBlock) + 1);
    if (count < Math.max(1, Number(required))) {
      throw new RedemptionBlockchainError('INSUFFICIENT_CONFIRMATIONS', `Transaction has ${count} confirmation(s); ${required} required.`, { pending: true });
    }
  }

  async assertCanonical(provider, receipt) {
    let block;
    try { block = await provider.getBlock(receipt.blockNumber); } catch {
      throw new RedemptionBlockchainError('RPC_UNAVAILABLE', 'Could not verify the canonical transaction block.', { transient: true });
    }
    if (!block || !receipt.blockHash || String(block.hash).toLowerCase() !== String(receipt.blockHash).toLowerCase()) {
      throw new RedemptionBlockchainError('CHAIN_REORGANIZATION', 'Transaction block is no longer canonical.', { pending: true });
    }
  }

  async transaction(provider, txHash, label) {
    let tx; let receipt;
    try { [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]); } catch {
      throw new RedemptionBlockchainError('RPC_UNAVAILABLE', `Could not fetch the ${label} transaction.`, { transient: true });
    }
    if (!tx || !receipt) throw new RedemptionBlockchainError('TRANSACTION_NOT_FOUND', `${label} transaction is not yet available.`, { pending: true });
    if (Number(receipt.status) !== 1) throw new RedemptionBlockchainError(`${label.toUpperCase()}_REVERTED`, `${label} transaction reverted on-chain.`);
    const latest = await provider.getBlockNumber();
    this.assertConfirmations(latest, receipt.blockNumber);
    await this.assertCanonical(provider, receipt);
    return { tx, receipt };
  }

  async submitAction(action, expected) {
    const functions = { LOCK: 'freezePartialTokens', BURN: 'burn', UNLOCK: 'unfreezePartialTokens' };
    const functionName = functions[action];
    if (!functionName) throw new RedemptionBlockchainError('INVALID_REDEMPTION_ACTION', 'Unsupported redemption token action.');
    return this.withProvider(async (provider) => {
      const platformAddress = this.platformWalletAddress();
      if (!sameAddress(platformAddress, expected.platformWalletAddress)) {
        throw new RedemptionBlockchainError('PLATFORM_WALLET_MISMATCH', 'Stored platform wallet does not match configured signer.');
      }
      const signer = this.walletFactory(this.config.deployerPrivateKey, provider);
      const token = this.contractFactory(expected.tokenAddress, REDEMPTION_TOKEN_ABI, signer);
      let isAgent;
      try { isAgent = await token.isAgent(platformAddress); } catch {
        throw new RedemptionBlockchainError('TOKEN_AGENT_CHECK_FAILED', 'Could not verify the platform Token Agent role.', { transient: true });
      }
      if (!isAgent) throw new RedemptionBlockchainError('PLATFORM_NOT_TOKEN_AGENT', 'Platform wallet is not an authorized Token Agent.');
      const preparedAtBlock = Number(await provider.getBlockNumber());
      try {
        const amountRaw = action === 'UNLOCK' ? expected.unlockAmountRaw : expected.tokenAmountRaw;
        const tx = await token[functionName](expected.investorWalletAddress, BigInt(amountRaw));
        return { txHash: tx.hash.toLowerCase(), preparedAtBlock, amountRaw: String(amountRaw) };
      } catch (error) {
        const deterministic = ['CALL_EXCEPTION', 'INSUFFICIENT_FUNDS', 'INVALID_ARGUMENT'].includes(error.code);
        throw new RedemptionBlockchainError(`${action}_BROADCAST_FAILED`, error.shortMessage || error.message || `${action} transaction could not be submitted.`, { transient: !deterministic });
      }
    });
  }

  async verifyAction(action, txHash, expected) {
    if (!ethers.isHexString(txHash, 32)) throw new RedemptionBlockchainError(`INVALID_${action}_TX_HASH`, `${action} transaction hash is invalid.`);
    const definitions = {
      LOCK: { functionName: 'freezePartialTokens', eventName: 'TokensFrozen' },
      UNLOCK: { functionName: 'unfreezePartialTokens', eventName: 'TokensUnfrozen' },
      BURN: { functionName: 'burn', eventName: 'Transfer' },
    };
    const definition = definitions[action];
    if (!definition) throw new RedemptionBlockchainError('INVALID_REDEMPTION_ACTION', 'Unsupported redemption token action.');
    return this.withProvider(async (provider, chainId) => {
      const { tx, receipt } = await this.transaction(provider, txHash, action.toLowerCase());
      if (!sameAddress(tx.to, expected.tokenAddress) || !sameAddress(tx.from, expected.platformWalletAddress)) {
        throw new RedemptionBlockchainError(`${action}_TRANSACTION_MISMATCH`, `${action} contract or sender does not match the redemption.`);
      }
      let decoded;
      try { decoded = this.tokenInterface.parseTransaction({ data: tx.data, value: tx.value }); } catch {
        throw new RedemptionBlockchainError(`INVALID_${action}_FUNCTION`, `Transaction is not the expected ${action} call.`);
      }
      const amountRaw = action === 'UNLOCK' ? expected.unlockAmountRaw : expected.tokenAmountRaw;
      if (decoded?.name !== definition.functionName || !sameAddress(decoded.args[0], expected.investorWalletAddress)
        || decoded.args[1].toString() !== String(amountRaw)) {
        throw new RedemptionBlockchainError(`${action}_PARAMETERS_MISMATCH`, `${action} wallet or amount does not match the redemption.`);
      }
      let matched = null;
      for (const log of receipt.logs || []) {
        if (!sameAddress(log.address, expected.tokenAddress)) continue;
        let parsed; try { parsed = this.tokenInterface.parseLog(log); } catch { continue; }
        if (action === 'BURN') {
          if (parsed?.name === 'Transfer' && sameAddress(parsed.args[0], expected.investorWalletAddress)
            && sameAddress(parsed.args[1], ethers.ZeroAddress) && parsed.args[2].toString() === String(amountRaw)) { matched = log; break; }
        } else if (parsed?.name === definition.eventName && sameAddress(parsed.args[0], expected.investorWalletAddress)
          && parsed.args[1].toString() === String(amountRaw)) { matched = log; break; }
      }
      if (!matched) throw new RedemptionBlockchainError(`${action}_EVENT_MISSING`, `Expected ${definition.eventName} event was not emitted.`);

      let balanceAfter; let frozenAfter; let totalSupplyAfter;
      try {
        const token = this.contractFactory(expected.tokenAddress, REDEMPTION_TOKEN_ABI, provider);
        [balanceAfter, frozenAfter, totalSupplyAfter] = await Promise.all([
          token.balanceOf(expected.investorWalletAddress), token.getFrozenTokens(expected.investorWalletAddress), token.totalSupply(),
        ]);
      } catch {
        throw new RedemptionBlockchainError(`${action}_STATE_UNAVAILABLE`, `Could not verify final token state after ${action}.`, { transient: true });
      }
      if (action === 'LOCK' && frozenAfter < BigInt(expected.frozenBeforeRaw) + BigInt(amountRaw)) {
        throw new RedemptionBlockchainError('LOCK_STATE_MISMATCH', 'Investor frozen balance does not reflect the redemption lock.');
      }
      if (action === 'UNLOCK' && frozenAfter > BigInt(expected.frozenBeforeRaw)) {
        throw new RedemptionBlockchainError('UNLOCK_STATE_MISMATCH', 'Redemption token lock was not fully released.');
      }
      return {
        chainId, txHash: txHash.toLowerCase(), ...receiptFields(receipt, matched),
        balanceAfterRaw: balanceAfter.toString(), frozenAfterRaw: frozenAfter.toString(),
        totalSupplyAfterRaw: totalSupplyAfter.toString(),
      };
    });
  }

  async verifyPayment(txHash, expected) {
    if (!ethers.isHexString(txHash, 32)) throw new RedemptionBlockchainError('INVALID_PAYMENT_TX_HASH', 'Payment transaction hash is invalid.');
    return this.withProvider(async (provider, chainId) => {
      const { tx, receipt } = await this.transaction(provider, txHash, 'payment');
      if (!sameAddress(tx.to, expected.usdtContractAddress)) throw new RedemptionBlockchainError('INVALID_USDT_CONTRACT', 'Payment was sent through a different contract.');
      if (!sameAddress(tx.from, expected.issuerPaymentWalletAddress)) throw new RedemptionBlockchainError('INVALID_PAYMENT_SENDER', 'Payment sender does not match the issuer payment wallet.');
      let decoded;
      try { decoded = this.usdtInterface.parseTransaction({ data: tx.data, value: tx.value }); } catch {
        throw new RedemptionBlockchainError('INVALID_PAYMENT_FUNCTION', 'Payment transaction is not an ERC-20 transfer.');
      }
      if (decoded?.name !== 'transfer' || !sameAddress(decoded.args[0], expected.investorWalletAddress)
        || decoded.args[1].toString() !== String(expected.usdtAmountRaw)) {
        throw new RedemptionBlockchainError('PAYMENT_PARAMETERS_MISMATCH', 'USDT recipient or amount does not match the redemption.');
      }
      let matched = null;
      for (const log of receipt.logs || []) {
        if (!sameAddress(log.address, expected.usdtContractAddress)) continue;
        let parsed; try { parsed = this.usdtInterface.parseLog(log); } catch { continue; }
        if (parsed?.name === 'Transfer' && sameAddress(parsed.args[0], expected.issuerPaymentWalletAddress)
          && sameAddress(parsed.args[1], expected.investorWalletAddress)
          && parsed.args[2].toString() === String(expected.usdtAmountRaw)) { matched = log; break; }
      }
      if (!matched) throw new RedemptionBlockchainError('PAYMENT_EVENT_MISSING', 'Expected USDT Transfer event was not emitted.');
      return { chainId, txHash: txHash.toLowerCase(), ...receiptFields(receipt, matched) };
    });
  }

  async scanPaymentEvents(fromBlock, toBlock) {
    return this.withProvider(async (provider, chainId) => {
      const logs = await provider.getLogs({
        address: this.config.redemptionUsdtAddress, topics: [this.transferTopic], fromBlock, toBlock,
      });
      return logs.map((log) => {
        const parsed = this.usdtInterface.parseLog(log);
        return {
          chainId, usdtContractAddress: ethers.getAddress(log.address),
          fromWalletAddress: ethers.getAddress(parsed.args[0]), toWalletAddress: ethers.getAddress(parsed.args[1]),
          amountRaw: parsed.args[2].toString(), txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber), blockHash: log.blockHash || null,
          transactionIndex: Number(log.transactionIndex || 0), logIndex: Number(log.index ?? log.logIndex ?? 0),
        };
      });
    });
  }

  async findActionEvent(action, expected, fromBlock, toBlock) {
    const eventName = action === 'LOCK' ? 'TokensFrozen' : action === 'UNLOCK' ? 'TokensUnfrozen' : 'Transfer';
    const event = this.tokenInterface.getEvent(eventName);
    const topics = action === 'BURN'
      ? [event.topicHash, ethers.zeroPadValue(expected.investorWalletAddress, 32), ethers.zeroPadValue(ethers.ZeroAddress, 32)]
      : [event.topicHash, ethers.zeroPadValue(expected.investorWalletAddress, 32)];
    const amountRaw = action === 'UNLOCK' ? expected.unlockAmountRaw : expected.tokenAmountRaw;
    return this.withProvider(async (provider) => {
      const logs = await provider.getLogs({ address: expected.tokenAddress, topics, fromBlock, toBlock });
      const match = logs.find((log) => {
        try {
          const parsed = this.tokenInterface.parseLog(log);
          return (action === 'BURN' ? parsed.args[2] : parsed.args[1]).toString() === String(amountRaw);
        } catch { return false; }
      });
      return match?.transactionHash?.toLowerCase() || null;
    });
  }

  async currentFrozen(expected) {
    return this.withProvider(async (provider) => {
      const token = this.contractFactory(expected.tokenAddress, REDEMPTION_TOKEN_ABI, provider);
      return String(await token.getFrozenTokens(expected.investorWalletAddress));
    });
  }

  async chainHead() {
    return this.withProvider(async (provider, chainId) => {
      const latestBlock = Number(await provider.getBlockNumber());
      return { chainId, latestBlock, safeBlock: Math.max(0, latestBlock - this.confirmations() + 1) };
    });
  }

  async blockHash(blockNumber) {
    return this.withProvider(async (provider) => (await provider.getBlock(blockNumber))?.hash || null);
  }
}

module.exports = {
  TokenRedemptionBlockchainService, RedemptionBlockchainError, REDEMPTION_USDT_ABI,
  REDEMPTION_TOKEN_ABI, AUTHORIZATION_TYPES, sameAddress,
};
