const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  TokenTransferBlockchainService,
  TOKEN_TRANSFER_ABI,
} = require('../../src/services/blockchain/token-transfer-blockchain.service');

const address = (char) => ethers.getAddress(`0x${char.repeat(40)}`);
const TOKEN = address('1');
const REGISTRY = address('2');
const SENDER = address('3');
const RECIPIENT = address('4');
const SENDER_ID = address('5');
const RECIPIENT_ID = address('6');
const TX = `0x${'a'.repeat(64)}`;

const expected = {
  tokenAddress: TOKEN,
  identityRegistryAddress: REGISTRY,
  senderWalletAddress: SENDER,
  recipientWalletAddress: RECIPIENT,
  senderIdentityAddress: SENDER_ID,
  recipientIdentityAddress: RECIPIENT_ID,
  tokenAmountRaw: '250',
};

test('prepares only a compliant transfer between registry-verified investors', async () => {
  const token = {
    decimals: async () => 2,
    balanceOf: async (wallet) => (wallet === SENDER ? 1000n : 100n),
    getFrozenTokens: async () => 100n,
    paused: async () => false,
    identityRegistry: async () => REGISTRY,
    canTransfer: async () => [true, '0x00', ethers.ZeroHash],
  };
  const registry = {
    contains: async () => true,
    isVerified: async () => true,
    identity: async (wallet) => (wallet === SENDER ? SENDER_ID : RECIPIENT_ID),
  };
  const service = new TokenTransferBlockchainService({
    sepoliaRpcUrl: 'rpc', chainId: 11155111, transferConfirmations: 1,
  }, {
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: 11155111n }),
      getBlockNumber: async () => 100,
      destroy: () => {},
    }),
    contractFactory: (contractAddress) => (contractAddress === TOKEN ? token : registry),
  });

  const result = await service.prepare(expected);
  assert.equal(result.chainId, 11155111);
  assert.equal(result.tokenDecimals, 2);
  assert.equal(result.senderBalanceBeforeRaw, '1000');
  assert.equal(result.senderFrozenBeforeRaw, '100');
  assert.equal(result.preparedAtBlock, 100);
});

test('verifies contract, sender, calldata, receipt, Transfer event and canonical balances', async () => {
  const iface = new ethers.Interface(TOKEN_TRANSFER_ABI);
  const encoded = iface.encodeEventLog(iface.getEvent('Transfer'), [SENDER, RECIPIENT, 250n]);
  const blockHash = `0x${'b'.repeat(64)}`;
  const tx = {
    chainId: 11155111n,
    to: TOKEN,
    from: SENDER,
    data: iface.encodeFunctionData('transfer', [RECIPIENT, 250n]),
    value: 0n,
  };
  const receipt = {
    status: 1,
    blockNumber: 100,
    blockHash,
    index: 2,
    gasUsed: 70000n,
    gasPrice: 11n,
    logs: [{ address: TOKEN, topics: encoded.topics, data: encoded.data, index: 8 }],
  };
  const token = {
    balanceOf: async (wallet, options) => {
      assert.equal(options.blockTag, 100);
      return wallet === SENDER ? 750n : 350n;
    },
    getFrozenTokens: async (_wallet, options) => {
      assert.equal(options.blockTag, 100);
      return 100n;
    },
  };
  const service = new TokenTransferBlockchainService({
    sepoliaRpcUrl: 'rpc', chainId: 11155111, transferConfirmations: 1,
  }, {
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: 11155111n }),
      getTransaction: async () => tx,
      getTransactionReceipt: async () => receipt,
      getBlockNumber: async () => 100,
      getBlock: async () => ({ hash: blockHash }),
      destroy: () => {},
    }),
    contractFactory: () => token,
  });

  const result = await service.verify(TX, expected, { confirmations: 1 });
  assert.equal(result.txHash, TX);
  assert.equal(result.blockNumber, 100);
  assert.equal(result.transactionIndex, 2);
  assert.equal(result.logIndex, 8);
  assert.equal(result.senderBalanceAfterRaw, '750');
  assert.equal(result.recipientBalanceAfterRaw, '350');
});

test('does not confirm a transaction with mismatching transfer parameters', async () => {
  const iface = new ethers.Interface(TOKEN_TRANSFER_ABI);
  const tx = {
    to: TOKEN,
    from: SENDER,
    data: iface.encodeFunctionData('transfer', [RECIPIENT, 251n]),
    value: 0n,
  };
  const service = new TokenTransferBlockchainService({ sepoliaRpcUrl: 'rpc', chainId: 11155111 }, {
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: 11155111n }),
      getTransaction: async () => tx,
      getTransactionReceipt: async () => ({ status: 1, blockNumber: 100, logs: [] }),
      destroy: () => {},
    }),
  });
  await assert.rejects(
    service.verify(TX, expected),
    (error) => error.code === 'TRANSFER_PARAMETERS_MISMATCH',
  );
});
