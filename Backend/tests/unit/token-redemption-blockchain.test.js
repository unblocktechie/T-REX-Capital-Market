const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  TokenRedemptionBlockchainService, REDEMPTION_USDT_ABI, REDEMPTION_TOKEN_ABI,
} = require('../../src/services/blockchain/token-redemption-blockchain.service');

const address = (char) => ethers.getAddress(`0x${char.repeat(40)}`);
const USDT = address('1'); const TOKEN = address('2'); const INVESTOR = address('3');
const ISSUER = address('4'); const PLATFORM = address('5'); const TX = `0x${'a'.repeat(64)}`;

const providerService = (tx, receipt, contractFactory = () => ({
  balanceOf: async () => 80n, getFrozenTokens: async () => 20n, totalSupply: async () => 1000n,
})) => new TokenRedemptionBlockchainService({
  sepoliaRpcUrl: 'rpc', chainId: 11155111, redemptionConfirmations: 2,
}, {
  providerFactory: () => ({
    getNetwork: async () => ({ chainId: 11155111n }), getTransaction: async () => tx,
    getTransactionReceipt: async () => receipt, getBlockNumber: async () => 101,
    getBlock: async () => ({ hash: receipt.blockHash }), destroy: () => {},
  }),
  contractFactory,
});

test('redemption EIP-712 authorization must be signed by the registered investor wallet', async () => {
  const wallet = ethers.Wallet.createRandom();
  const service = new TokenRedemptionBlockchainService({ chainId: 11155111 });
  const row = {
    redemptionUid: 'redemption-1', chainId: 11155111, investorWalletAddress: wallet.address,
    tokenAddress: TOKEN, tokenAmountRaw: '25', usdtAmountRaw: '5000000',
    issuerPaymentWalletAddress: ISSUER, authorizationNonce: 'nonce-1',
    authorizationDeadline: new Date(Date.now() + 60000),
  };
  const payload = service.authorizationPayload(row);
  const signature = await wallet.signTypedData(payload.domain, payload.types, payload.message);
  const verified = service.verifyAuthorization(row, signature);
  assert.equal(verified.signer, wallet.address);
});

test('issuer USDT payment verification checks sender, investor recipient, amount, event and canonical block', async () => {
  const iface = new ethers.Interface(REDEMPTION_USDT_ABI);
  const event = iface.encodeEventLog(iface.getEvent('Transfer'), [ISSUER, INVESTOR, 5000000n]);
  const tx = { to: USDT, from: ISSUER, data: iface.encodeFunctionData('transfer', [INVESTOR, 5000000n]), value: 0n };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`, index: 2, gasUsed: 50000n, gasPrice: 10n,
    logs: [{ address: USDT, topics: event.topics, data: event.data, index: 7 }],
  };
  const verified = await providerService(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT, issuerPaymentWalletAddress: ISSUER,
    investorWalletAddress: INVESTOR, usdtAmountRaw: '5000000',
  });
  assert.equal(verified.blockNumber, 100);
  assert.equal(verified.logIndex, 7);
});

test('platform lock verification checks exact calldata, TokensFrozen event and final frozen state', async () => {
  const iface = new ethers.Interface(REDEMPTION_TOKEN_ABI);
  const event = iface.encodeEventLog(iface.getEvent('TokensFrozen'), [INVESTOR, 20n]);
  const tx = { to: TOKEN, from: PLATFORM, data: iface.encodeFunctionData('freezePartialTokens', [INVESTOR, 20n]), value: 0n };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'c'.repeat(64)}`, index: 1, gasUsed: 80000n, gasPrice: 12n,
    logs: [{ address: TOKEN, topics: event.topics, data: event.data, index: 3 }],
  };
  const verified = await providerService(tx, receipt).verifyAction('LOCK', TX, {
    tokenAddress: TOKEN, platformWalletAddress: PLATFORM, investorWalletAddress: INVESTOR,
    tokenAmountRaw: '20', frozenBeforeRaw: '0',
  });
  assert.equal(verified.frozenAfterRaw, '20');
});

test('platform burn verification requires the exact investor-to-zero Transfer event', async () => {
  const iface = new ethers.Interface(REDEMPTION_TOKEN_ABI);
  const event = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, ethers.ZeroAddress, 20n]);
  const tx = { to: TOKEN, from: PLATFORM, data: iface.encodeFunctionData('burn', [INVESTOR, 20n]), value: 0n };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'d'.repeat(64)}`, index: 1, gasUsed: 90000n, gasPrice: 12n,
    logs: [{ address: TOKEN, topics: event.topics, data: event.data, index: 4 }],
  };
  const verified = await providerService(tx, receipt).verifyAction('BURN', TX, {
    tokenAddress: TOKEN, platformWalletAddress: PLATFORM, investorWalletAddress: INVESTOR,
    tokenAmountRaw: '20', frozenBeforeRaw: '0',
  });
  assert.equal(verified.logIndex, 4);
});

test('verification rejects a transaction whose receipt block is no longer canonical', async () => {
  const iface = new ethers.Interface(REDEMPTION_USDT_ABI);
  const event = iface.encodeEventLog(iface.getEvent('Transfer'), [ISSUER, INVESTOR, 1n]);
  const receipt = { status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`, logs: [{ address: USDT, topics: event.topics, data: event.data }] };
  const service = new TokenRedemptionBlockchainService({ sepoliaRpcUrl: 'rpc', chainId: 11155111, redemptionConfirmations: 2 }, {
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: 11155111n }),
      getTransaction: async () => ({ to: USDT, from: ISSUER, data: iface.encodeFunctionData('transfer', [INVESTOR, 1n]), value: 0n }),
      getTransactionReceipt: async () => receipt, getBlockNumber: async () => 101,
      getBlock: async () => ({ hash: `0x${'e'.repeat(64)}` }), destroy: () => {},
    }),
  });
  await assert.rejects(service.verifyPayment(TX, {
    usdtContractAddress: USDT, issuerPaymentWalletAddress: ISSUER, investorWalletAddress: INVESTOR, usdtAmountRaw: '1',
  }), (error) => error.code === 'CHAIN_REORGANIZATION');
});
