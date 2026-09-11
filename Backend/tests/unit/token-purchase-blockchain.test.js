const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  TokenPurchaseBlockchainService, ERC20_ABI, TREX_TOKEN_ABI,
} = require('../../src/services/blockchain/token-purchase-blockchain.service');

const address = (char) => ethers.getAddress(`0x${char.repeat(40)}`);
const USDT = address('1'); const TOKEN = address('2'); const INVESTOR = address('3');
const TREASURY = address('4'); const PLATFORM = address('5'); const TX = `0x${'a'.repeat(64)}`;

const serviceWith = (tx, receipt, contractFactory = () => ({})) => new TokenPurchaseBlockchainService({
  sepoliaRpcUrl: 'rpc', chainId: 11155111, purchaseConfirmations: 2,
}, {
  providerFactory: () => ({
    getNetwork: async () => ({ chainId: 11155111n }), getTransaction: async () => tx,
    getTransactionReceipt: async () => receipt, getBlockNumber: async () => 101,
    getBlock: async () => ({ hash: receipt.blockHash }),
    waitForTransaction: async () => receipt, destroy: () => {},
  }),
  contractFactory,
});

test('strictly verifies the exact USDT transfer calldata, receipt, and event', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, TREASURY, 1500000n]);
  const tx = { to: USDT, from: INVESTOR, data: iface.encodeFunctionData('transfer', [TREASURY, 1500000n]), value: 0n };
  const receipt = { status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`, index: 0, gasUsed: 50000n, gasPrice: 10n,
    logs: [{ address: USDT, topics: encoded.topics, data: encoded.data, index: 7 }] };
  const verified = await serviceWith(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT, investorWalletAddress: INVESTOR, treasuryWalletAddress: TREASURY, usdtAmountRaw: '1500000',
  });
  assert.equal(verified.blockNumber, 100);
  assert.equal(verified.logIndex, 7);
  assert.equal(verified.executionType, 'DIRECT');
});

test('accepts delegated wallet execution when the canonical USDT event exactly matches the intent', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const DELEGATION_MANAGER = address('6');
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, TREASURY, 1500000n]);
  const tx = {
    to: DELEGATION_MANAGER,
    from: INVESTOR,
    data: '0xcef6d209',
    value: 0n,
  };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`, index: 2,
    gasUsed: 90000n, gasPrice: 11n,
    logs: [{ address: USDT, topics: encoded.topics, data: encoded.data, index: 9 }],
  };

  const verified = await serviceWith(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT,
    investorWalletAddress: INVESTOR,
    treasuryWalletAddress: TREASURY,
    usdtAmountRaw: '1500000',
  });

  assert.equal(verified.executionType, 'DELEGATED');
  assert.equal(verified.transactionIndex, 2);
  assert.equal(verified.logIndex, 9);
});

test('rejects delegated execution from a different transaction sender', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, TREASURY, 1500000n]);
  const tx = { to: address('6'), from: address('7'), data: '0xcef6d209', value: 0n };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`,
    logs: [{ address: USDT, topics: encoded.topics, data: encoded.data, index: 1 }],
  };
  await assert.rejects(serviceWith(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT,
    investorWalletAddress: INVESTOR,
    treasuryWalletAddress: TREASURY,
    usdtAmountRaw: '1500000',
  }), (error) => error.code === 'INVALID_PAYMENT_SENDER');
});

test('rejects delegated execution without the exact configured USDT transfer event', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const wrongAmount = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, TREASURY, 1n]);
  const tx = { to: address('6'), from: INVESTOR, data: '0xcef6d209', value: 0n };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`,
    logs: [{ address: USDT, topics: wrongAmount.topics, data: wrongAmount.data, index: 1 }],
  };
  await assert.rejects(serviceWith(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT,
    investorWalletAddress: INVESTOR,
    treasuryWalletAddress: TREASURY,
    usdtAmountRaw: '1500000',
  }), (error) => error.code === 'PAYMENT_EVENT_MISSING');
});

test('rejects a delegated payment whose receipt block is no longer canonical', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, TREASURY, 1500000n]);
  const tx = { to: address('6'), from: INVESTOR, data: '0xcef6d209', value: 0n };
  const receipt = {
    status: 1, blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`,
    logs: [{ address: USDT, topics: encoded.topics, data: encoded.data, index: 1 }],
  };
  const service = new TokenPurchaseBlockchainService({
    sepoliaRpcUrl: 'rpc', chainId: 11155111, purchaseConfirmations: 2,
  }, {
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: 11155111n }),
      getTransaction: async () => tx,
      getTransactionReceipt: async () => receipt,
      getBlockNumber: async () => 101,
      getBlock: async () => ({ hash: `0x${'c'.repeat(64)}` }),
      destroy: () => {},
    }),
  });
  await assert.rejects(service.verifyPayment(TX, {
    usdtContractAddress: USDT,
    investorWalletAddress: INVESTOR,
    treasuryWalletAddress: TREASURY,
    usdtAmountRaw: '1500000',
  }), (error) => error.code === 'CHAIN_REORGANIZATION' && error.pending === true);
});

test('interactive payment verification can use its configured one-block confirmation threshold', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [INVESTOR, TREASURY, 1500000n]);
  const tx = { to: USDT, from: INVESTOR, data: iface.encodeFunctionData('transfer', [TREASURY, 1500000n]), value: 0n };
  const receipt = { status: 1, blockNumber: 101, blockHash: `0x${'b'.repeat(64)}`, index: 0, gasUsed: 50000n, gasPrice: 10n,
    logs: [{ address: USDT, topics: encoded.topics, data: encoded.data, index: 7 }] };
  const verified = await serviceWith(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT, investorWalletAddress: INVESTOR, treasuryWalletAddress: TREASURY, usdtAmountRaw: '1500000',
  }, { confirmations: 1 });
  assert.equal(verified.blockNumber, 101);
});

test('rejects a USDT transfer whose amount differs from the pending intent', async () => {
  const iface = new ethers.Interface(ERC20_ABI);
  const tx = { to: USDT, from: INVESTOR, data: iface.encodeFunctionData('transfer', [TREASURY, 1n]), value: 0n };
  const receipt = { status: 1, blockNumber: 100, logs: [] };
  await assert.rejects(serviceWith(tx, receipt).verifyPayment(TX, {
    usdtContractAddress: USDT, investorWalletAddress: INVESTOR, treasuryWalletAddress: TREASURY, usdtAmountRaw: '1500000',
  }), (error) => error.code === 'PAYMENT_PARAMETERS_MISMATCH');
});

test('strictly verifies platform mint calldata and zero-address Transfer event', async () => {
  const iface = new ethers.Interface(TREX_TOKEN_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [ethers.ZeroAddress, INVESTOR, 2n]);
  const tx = { to: TOKEN, from: PLATFORM, data: iface.encodeFunctionData('mint', [INVESTOR, 2n]), value: 0n };
  const receipt = { status: 1, blockNumber: 100, blockHash: `0x${'c'.repeat(64)}`, index: 1, gasUsed: 90000n, gasPrice: 12n,
    logs: [{ address: TOKEN, topics: encoded.topics, data: encoded.data, index: 3 }] };
  const verified = await serviceWith(tx, receipt, () => ({ balanceOf: async () => 2n })).verifyMint(TX, {
    tokenAddress: TOKEN, platformWalletAddress: PLATFORM, investorWalletAddress: INVESTOR, tokenAmountRaw: '2',
  });
  assert.equal(verified.logIndex, 3);
});

test('verifies mint state at the receipt block rather than using a later wallet balance', async () => {
  const iface = new ethers.Interface(TREX_TOKEN_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [ethers.ZeroAddress, INVESTOR, 2n]);
  const tx = { to: TOKEN, from: PLATFORM, data: iface.encodeFunctionData('mint', [INVESTOR, 2n]), value: 0n };
  const receipt = { status: 1, blockNumber: 100, blockHash: `0x${'c'.repeat(64)}`, index: 1, gasUsed: 90000n, gasPrice: 12n,
    logs: [{ address: TOKEN, topics: encoded.topics, data: encoded.data, index: 3 }] };
  let checkedBlockTag;
  const token = {
    balanceOf: async (_wallet, overrides) => {
      checkedBlockTag = overrides?.blockTag;
      return overrides?.blockTag === receipt.blockNumber ? 2n : 1n;
    },
  };

  const verified = await serviceWith(tx, receipt, () => token).verifyMint(TX, {
    tokenAddress: TOKEN, platformWalletAddress: PLATFORM, investorWalletAddress: INVESTOR, tokenAmountRaw: '2',
  });

  assert.equal(verified.blockNumber, 100);
  assert.equal(checkedBlockTag, 100);
});

test('waits for a mined mint and returns complete receipt metadata at one confirmation', async () => {
  const iface = new ethers.Interface(TREX_TOKEN_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [ethers.ZeroAddress, INVESTOR, 2n]);
  const tx = { to: TOKEN, from: PLATFORM, data: iface.encodeFunctionData('mint', [INVESTOR, 2n]), value: 0n };
  const receipt = { status: 1, blockNumber: 101, blockHash: `0x${'d'.repeat(64)}`, index: 4, gasUsed: 91000n, gasPrice: 13n,
    logs: [{ address: TOKEN, topics: encoded.topics, data: encoded.data, index: 9 }] };
  const verified = await serviceWith(tx, receipt, () => ({ balanceOf: async () => 2n })).waitForMint(TX, {
    tokenAddress: TOKEN, platformWalletAddress: PLATFORM, investorWalletAddress: INVESTOR, tokenAmountRaw: '2',
  }, { confirmations: 1, timeoutMs: 1000 });
  assert.equal(verified.blockNumber, 101);
  assert.equal(verified.transactionIndex, 4);
  assert.equal(verified.logIndex, 9);
  assert.equal(verified.gasUsed, '91000');
  assert.equal(verified.effectiveGasPrice, '13');
});
