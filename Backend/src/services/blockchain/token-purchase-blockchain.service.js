const ethers = require('ethers');
const { env } = require('../../core/config/env');

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];
const TREX_TOKEN_ABI = [
  ...ERC20_ABI,
  'function mint(address to, uint256 amount) returns (bool)',
  'function isAgent(address agent) view returns (bool)',
];

class PurchaseBlockchainError extends Error {
  constructor(code, message, { transient = false, pending = false } = {}) {
    super(message);
    this.name = 'PurchaseBlockchainError';
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

class TokenPurchaseBlockchainService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url));
    this.walletFactory = dependencies.walletFactory || ((key, provider) => new ethers.Wallet(key, provider));
    this.contractFactory = dependencies.contractFactory || ((address, abi, runner) => new ethers.Contract(address, abi, runner));
    this.usdtInterface = dependencies.usdtInterface || new ethers.Interface(ERC20_ABI);
    this.tokenInterface = dependencies.tokenInterface || new ethers.Interface(TREX_TOKEN_ABI);
    this.transferTopic = this.usdtInterface.getEvent('Transfer').topicHash;
  }

  confirmations() { return Math.max(1, Number(this.config.purchaseConfirmations || 12)); }

  async withProvider(work) {
    if (!this.config.sepoliaRpcUrl) throw new PurchaseBlockchainError('RPC_UNAVAILABLE', 'Blockchain RPC is not configured.', { transient: true });
    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    try {
      const network = await provider.getNetwork().catch(() => null);
      if (!network) throw new PurchaseBlockchainError('RPC_UNAVAILABLE', 'Could not reach the blockchain RPC.', { transient: true });
      const chainId = Number(network.chainId);
      if (chainId !== Number(this.config.chainId)) throw new PurchaseBlockchainError('WRONG_CHAIN', `RPC is connected to chain ${chainId}.`);
      return await work(provider, chainId);
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  platformWalletAddress() {
    if (!this.config.deployerPrivateKey) throw new PurchaseBlockchainError('PLATFORM_WALLET_NOT_CONFIGURED', 'Platform wallet is not configured.');
    let address;
    try { address = new ethers.Wallet(this.config.deployerPrivateKey).address; } catch {
      throw new PurchaseBlockchainError('PLATFORM_WALLET_INVALID', 'Platform private key is invalid.');
    }
    if (this.config.deployerAddress && ethers.isAddress(this.config.deployerAddress)
      && !sameAddress(address, this.config.deployerAddress)) {
      throw new PurchaseBlockchainError('PLATFORM_WALLET_MISMATCH', 'Configured deployer address does not match the private key.');
    }
    return ethers.getAddress(address);
  }

  async prepare({ usdtContractAddress, tokenAddress, investorWalletAddress }) {
    if (![usdtContractAddress, tokenAddress, investorWalletAddress].every(ethers.isAddress)) {
      throw new PurchaseBlockchainError('PURCHASE_ADDRESSES_INVALID', 'Purchase blockchain addresses are invalid.');
    }
    const platformWalletAddress = this.platformWalletAddress();
    return this.withProvider(async (provider, chainId) => {
      const usdt = this.contractFactory(usdtContractAddress, ERC20_ABI, provider);
      const token = this.contractFactory(tokenAddress, TREX_TOKEN_ABI, provider);
      let usdtDecimals; let balanceBeforeRaw; let platformIsAgent; let preparedAtBlock;
      try {
        [usdtDecimals, balanceBeforeRaw, platformIsAgent, preparedAtBlock] = await Promise.all([
          usdt.decimals(), token.balanceOf(investorWalletAddress), token.isAgent(platformWalletAddress), provider.getBlockNumber(),
        ]);
      } catch {
        throw new PurchaseBlockchainError('PURCHASE_STATE_UNAVAILABLE', 'Could not read token purchase prerequisites.', { transient: true });
      }
      return {
        chainId, usdtDecimals: Number(usdtDecimals), balanceBeforeRaw: balanceBeforeRaw.toString(),
        platformWalletAddress, platformIsAgent: Boolean(platformIsAgent), preparedAtBlock: Number(preparedAtBlock),
      };
    });
  }

  expectedConfirmations(latestBlock, receiptBlock, requiredConfirmations = this.confirmations()) {
    const required = Math.max(1, Number(requiredConfirmations || this.confirmations()));
    const actual = Math.max(0, Number(latestBlock) - Number(receiptBlock) + 1);
    if (actual < required) {
      throw new PurchaseBlockchainError('INSUFFICIENT_CONFIRMATIONS', `Transaction has ${actual} confirmation(s); ${required} required.`, { pending: true });
    }
  }

  async verifyPayment(txHash, expected, { confirmations = this.confirmations() } = {}) {
    if (!ethers.isHexString(txHash, 32)) throw new PurchaseBlockchainError('INVALID_TX_HASH', 'Transaction hash is invalid.');
    return this.withProvider(async (provider, chainId) => {
      let tx; let receipt;
      try { [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]); } catch {
        throw new PurchaseBlockchainError('RPC_UNAVAILABLE', 'Could not fetch the payment transaction.', { transient: true });
      }
      if (!tx || !receipt) throw new PurchaseBlockchainError('TRANSACTION_NOT_FOUND', 'Payment transaction is not yet available.', { pending: true });
      if (!sameAddress(tx.to, expected.usdtContractAddress)) throw new PurchaseBlockchainError('INVALID_USDT_CONTRACT', 'Payment was sent to a different contract.');
      if (!sameAddress(tx.from, expected.investorWalletAddress)) throw new PurchaseBlockchainError('INVALID_PAYMENT_SENDER', 'Payment sender does not match the investor wallet.');
      let decoded;
      try { decoded = this.usdtInterface.parseTransaction({ data: tx.data, value: tx.value }); } catch {
        throw new PurchaseBlockchainError('INVALID_PAYMENT_FUNCTION', 'Payment transaction is not an ERC-20 transfer.');
      }
      if (decoded?.name !== 'transfer') throw new PurchaseBlockchainError('INVALID_PAYMENT_FUNCTION', 'Payment must call transfer.');
      if (!sameAddress(decoded.args[0], expected.treasuryWalletAddress)
        || decoded.args[1].toString() !== String(expected.usdtAmountRaw)) {
        throw new PurchaseBlockchainError('PAYMENT_PARAMETERS_MISMATCH', 'USDT recipient or amount does not match the pending purchase.');
      }
      if (Number(receipt.status) !== 1) throw new PurchaseBlockchainError('PAYMENT_REVERTED', 'USDT payment reverted on-chain.');
      const latest = await provider.getBlockNumber();
      this.expectedConfirmations(latest, receipt.blockNumber, confirmations);
      let matched = null;
      for (const log of receipt.logs || []) {
        if (!sameAddress(log.address, expected.usdtContractAddress)) continue;
        let parsed; try { parsed = this.usdtInterface.parseLog(log); } catch { continue; }
        if (parsed?.name === 'Transfer' && sameAddress(parsed.args[0], expected.investorWalletAddress)
          && sameAddress(parsed.args[1], expected.treasuryWalletAddress)
          && parsed.args[2].toString() === String(expected.usdtAmountRaw)) { matched = log; break; }
      }
      if (!matched) throw new PurchaseBlockchainError('PAYMENT_EVENT_MISSING', 'Expected USDT Transfer event was not emitted.');
      return { chainId, txHash: txHash.toLowerCase(), ...receiptFields(receipt, matched) };
    });
  }

  async submitMint(expected) {
    return this.withProvider(async (provider) => {
      const platformAddress = this.platformWalletAddress();
      if (!sameAddress(platformAddress, expected.platformWalletAddress)) {
        throw new PurchaseBlockchainError('PLATFORM_WALLET_MISMATCH', 'Stored platform wallet does not match configured signer.');
      }
      const signer = this.walletFactory(this.config.deployerPrivateKey, provider);
      const token = this.contractFactory(expected.tokenAddress, TREX_TOKEN_ABI, signer);
      let isAgent;
      try { isAgent = await token.isAgent(platformAddress); } catch {
        throw new PurchaseBlockchainError('TOKEN_AGENT_CHECK_FAILED', 'Could not verify the platform Token Agent role.', { transient: true });
      }
      if (!isAgent) throw new PurchaseBlockchainError('PLATFORM_NOT_TOKEN_AGENT', 'Platform wallet is not an authorized Token Agent.');
      const preparedAtBlock = Number(await provider.getBlockNumber());
      try {
        const tx = await token.mint(expected.investorWalletAddress, BigInt(expected.tokenAmountRaw));
        return { txHash: tx.hash.toLowerCase(), preparedAtBlock };
      } catch (error) {
        throw new PurchaseBlockchainError('MINT_BROADCAST_FAILED', error.shortMessage || error.message || 'Token mint could not be submitted.', { transient: true });
      }
    });
  }

  async verifyMint(txHash, expected, { confirmations = this.confirmations() } = {}) {
    if (!ethers.isHexString(txHash, 32)) throw new PurchaseBlockchainError('INVALID_MINT_TX_HASH', 'Mint transaction hash is invalid.');
    return this.withProvider(async (provider, chainId) => {
      let tx; let receipt;
      try { [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]); } catch {
        throw new PurchaseBlockchainError('RPC_UNAVAILABLE', 'Could not fetch the mint transaction.', { transient: true });
      }
      if (!tx || !receipt) throw new PurchaseBlockchainError('MINT_TRANSACTION_NOT_FOUND', 'Mint transaction is not yet available.', { pending: true });
      if (!sameAddress(tx.to, expected.tokenAddress) || !sameAddress(tx.from, expected.platformWalletAddress)) {
        throw new PurchaseBlockchainError('MINT_TRANSACTION_MISMATCH', 'Mint contract or sender does not match the purchase.');
      }
      let decoded; try { decoded = this.tokenInterface.parseTransaction({ data: tx.data, value: tx.value }); } catch {
        throw new PurchaseBlockchainError('INVALID_MINT_FUNCTION', 'Transaction is not a token mint call.');
      }
      if (decoded?.name !== 'mint' || !sameAddress(decoded.args[0], expected.investorWalletAddress)
        || decoded.args[1].toString() !== String(expected.tokenAmountRaw)) {
        throw new PurchaseBlockchainError('MINT_PARAMETERS_MISMATCH', 'Mint recipient or amount does not match the purchase.');
      }
      if (Number(receipt.status) !== 1) throw new PurchaseBlockchainError('MINT_REVERTED', 'Mint transaction reverted on-chain.');
      const latest = await provider.getBlockNumber();
      this.expectedConfirmations(latest, receipt.blockNumber, confirmations);
      let matched = null;
      for (const log of receipt.logs || []) {
        if (!sameAddress(log.address, expected.tokenAddress)) continue;
        let parsed; try { parsed = this.tokenInterface.parseLog(log); } catch { continue; }
        if (parsed?.name === 'Transfer' && sameAddress(parsed.args[0], ethers.ZeroAddress)
          && sameAddress(parsed.args[1], expected.investorWalletAddress)
          && parsed.args[2].toString() === String(expected.tokenAmountRaw)) { matched = log; break; }
      }
      if (!matched) throw new PurchaseBlockchainError('MINT_EVENT_MISSING', 'Expected mint Transfer event was not emitted.');
      try {
        const token = this.contractFactory(expected.tokenAddress, TREX_TOKEN_ABI, provider);
        const balanceAtMintBlock = await token.balanceOf(expected.investorWalletAddress, { blockTag: receipt.blockNumber });
        if (balanceAtMintBlock < BigInt(expected.tokenAmountRaw)) {
          throw new PurchaseBlockchainError('MINT_STATE_MISMATCH', 'Investor token balance at the mint block does not reflect the verified mint.');
        }
      } catch (error) {
        if (error instanceof PurchaseBlockchainError) throw error;
        throw new PurchaseBlockchainError('MINT_STATE_UNAVAILABLE', 'Could not verify the investor token balance.', { transient: true });
      }
      return { chainId, txHash: txHash.toLowerCase(), ...receiptFields(receipt, matched) };
    });
  }

  async waitForMint(txHash, expected, {
    confirmations = this.confirmations(),
    timeoutMs = Number(this.config.transactionTimeoutMs || 120000),
  } = {}) {
    const required = Math.max(1, Number(confirmations || 1));
    try {
      const receipt = await this.withProvider((provider) => provider.waitForTransaction(
        txHash, required, Math.max(1000, Number(timeoutMs || 120000)),
      ));
      if (!receipt) {
        throw new PurchaseBlockchainError(
          'MINT_CONFIRMATION_PENDING',
          'Mint transaction is still waiting to be mined.',
          { pending: true },
        );
      }
    } catch (error) {
      if (error instanceof PurchaseBlockchainError) throw error;
      if (error?.code === 'TIMEOUT') {
        throw new PurchaseBlockchainError(
          'MINT_CONFIRMATION_PENDING',
          'Mint transaction was submitted but confirmation is still pending.',
          { pending: true },
        );
      }
      throw new PurchaseBlockchainError(
        'MINT_CONFIRMATION_CHECK_FAILED',
        error.shortMessage || error.message || 'Could not wait for mint confirmation.',
        { transient: true },
      );
    }
    return this.verifyMint(txHash, expected, { confirmations: required });
  }

  async scanPaymentEvents(fromBlock, toBlock) {
    return this.withProvider(async (provider, chainId) => {
      const logs = await provider.getLogs({ address: this.config.purchaseUsdtAddress, topics: [this.transferTopic], fromBlock, toBlock });
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

  async chainHead() {
    return this.withProvider(async (provider, chainId) => {
      const latestBlock = Number(await provider.getBlockNumber());
      return { chainId, latestBlock, safeBlock: Math.max(0, latestBlock - this.confirmations()) };
    });
  }

  async blockHash(blockNumber) {
    return this.withProvider(async (provider) => (await provider.getBlock(blockNumber))?.hash || null);
  }

  async findMintEvent(expected, fromBlock, toBlock) {
    return this.withProvider(async (provider) => {
      const logs = await provider.getLogs({
        address: expected.tokenAddress,
        topics: [this.transferTopic, ethers.zeroPadValue(ethers.ZeroAddress, 32), ethers.zeroPadValue(expected.investorWalletAddress, 32)],
        fromBlock, toBlock,
      });
      const matching = logs.find((log) => {
        try { return this.tokenInterface.parseLog(log).args[2].toString() === String(expected.tokenAmountRaw); } catch { return false; }
      });
      return matching?.transactionHash?.toLowerCase() || null;
    });
  }
}

module.exports = { TokenPurchaseBlockchainService, PurchaseBlockchainError, ERC20_ABI, TREX_TOKEN_ABI, sameAddress };
