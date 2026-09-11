const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const {
  BlockchainTransactionService, CONTROLLER_ABI, TOKEN_ABI, PAYMENT_ABI,
} = require('../../src/services/blockchain/blockchain-transaction.service');
const { BlockchainTransactionIndexerService } = require('../../src/services/blockchain/blockchain-transaction-indexer.service');

const address = (char) => ethers.getAddress(`0x${char.repeat(40)}`);
const CONTROLLER = address('1');
const USDT = address('2');
const TOKEN = address('3');
const INVESTOR = address('4');
const ISSUER = address('5');
const DELEGATION_MANAGER = address('6');
const TX_HASH = `0x${'a'.repeat(64)}`;
const BLOCK_HASH = `0x${'b'.repeat(64)}`;
const controllerInterface = new ethers.Interface(CONTROLLER_ABI);
const tokenInterface = new ethers.Interface(TOKEN_ABI);
const paymentInterface = new ethers.Interface(PAYMENT_ABI);

const encodedLog = (iface, event, values, contract, index) => {
  const encoded = iface.encodeEventLog(iface.getEvent(event), values);
  return {
    address: contract, topics: encoded.topics, data: encoded.data, index,
    transactionHash: TX_HASH, blockNumber: 100, blockHash: BLOCK_HASH,
  };
};

const makeContext = ({ receipt = true, quoteAmount = 5_000_000n, delegated = false } = {}) => {
  const buyData = controllerInterface.encodeFunctionData('buy', [TOKEN, 250n]);
  const delegationInterface = new ethers.Interface([
    'function redeemDelegations(bytes[] _permissionContexts,bytes32[] _modes,bytes[] _executionCallDatas)',
  ]);
  const delegatedData = delegationInterface.encodeFunctionData('redeemDelegations', [
    ['0x'], [ethers.ZeroHash], [ethers.concat([CONTROLLER, ethers.zeroPadValue('0x00', 32), buyData])],
  ]);
  const tx = {
    hash: TX_HASH, from: INVESTOR, to: delegated ? DELEGATION_MANAGER : CONTROLLER, value: 0n,
    data: delegated ? delegatedData : buyData,
  };
  const minedReceipt = {
    status: 1, blockNumber: 100, blockHash: BLOCK_HASH, index: 2,
    gasUsed: 125000n, gasPrice: 10n,
    logs: [
      encodedLog(tokenInterface, 'Transfer', [ethers.ZeroAddress, INVESTOR, 250n], TOKEN, 3),
      encodedLog(paymentInterface, 'Transfer', [INVESTOR, ISSUER, 5_000_000n], USDT, 4),
    ],
  };
  const state = { rows: new Map(), syncCount: 0 };
  const repository = {
    findTokenByUid: async () => ({
      tokenUid: '02647af2-e585-4c03-8984-108e1e44c616', organizationUid: 'org-1',
      tokenAddress: TOKEN, issuerWalletAddress: ISSUER, tokenSymbol: 'TREX', decimals: 2,
    }),
    findInvestorByUserUid: async () => ({ userUid: 'user-1', walletAddress: INVESTOR }),
    upsert: async (record) => {
      const key = `${record.chainId}:${record.transactionHash}:${record.type}`;
      const row = { transactionUid: state.rows.get(key)?.transactionUid || 'transaction-1', ...record };
      state.rows.set(key, row);
      return row;
    },
    synchronizeLegacy: async (record) => { if (record.status === 'CONFIRMED') state.syncCount += 1; },
  };
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
    getTransaction: async () => tx,
    getTransactionReceipt: async () => (receipt ? minedReceipt : null),
    getBlock: async () => ({ hash: BLOCK_HASH, timestamp: 1788400000 }),
    getBlockNumber: async () => 101,
    destroy: () => {},
  };
  const service = new BlockchainTransactionService({
    repository,
    config: {
      sepoliaRpcUrl: 'rpc', chainId: 11155111, platformControllerAddress: CONTROLLER,
      purchaseUsdtAddress: USDT, transactionIndexerConfirmations: 2,
      transactionDelegationManagerAddresses: [DELEGATION_MANAGER],
    },
    transactionRunner: (work) => work({}),
    dependencies: {
      providerFactory: () => provider,
      contractFactory: (contractAddress) => {
        if (contractAddress.toLowerCase() === CONTROLLER.toLowerCase()) {
          return {
            paymentToken: async () => USDT,
            getTokenInfo: async () => [ISSUER, 2, 2_000_000n, true],
            quoteBuy: async () => [quoteAmount, 2_000_000n, 2, ISSUER],
            quoteRedeem: async () => [quoteAmount, 2_000_000n, 2, ISSUER],
          };
        }
        return { decimals: async () => 6 };
      },
    },
  });
  return { service, state, tx, receipt: minedReceipt };
};

test('frontend buy hash is confirmed only after exact controller quote and events match', async () => {
  const { service, state } = makeContext();
  const result = await service.confirm({ userUid: 'user-1', roleName: 'Investor' }, {
    chainId: 11155111,
    txHash: TX_HASH,
    tokenUid: '02647af2-e585-4c03-8984-108e1e44c616',
    expectedAction: 'INVEST',
  });
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.tokenAmountRaw, '250');
  assert.equal(result.usdtAmountRaw, '5000000');
  assert.equal(result.logIndex, 4);
  assert.equal(result.gasUsed, '125000');
  assert.equal(state.rows.size, 1);
  assert.equal(state.syncCount, 1);
});

test('controller settlement differing from quote is never confirmed', async () => {
  const { service, state } = makeContext({ quoteAmount: 4_999_999n });
  await assert.rejects(service.confirm({ userUid: 'user-1', roleName: 'Investor' }, {
    chainId: 11155111,
    txHash: TX_HASH,
    tokenUid: '02647af2-e585-4c03-8984-108e1e44c616',
    expectedAction: 'INVEST',
  }), (error) => error.code === 'PAYMENT_AMOUNT_MISMATCH');
  assert.equal(state.rows.size, 0);
});

test('allowlisted delegated wallet execution is decoded to the exact controller call', async () => {
  const { service } = makeContext({ delegated: true });
  const result = await service.confirm({ userUid: 'user-1', roleName: 'Investor' }, {
    chainId: 11155111,
    txHash: TX_HASH,
    tokenUid: '02647af2-e585-4c03-8984-108e1e44c616',
    expectedAction: 'INVEST',
  });
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.executionType, 'DELEGATED');
});

test('known unmined transaction is stored as SUBMITTED and never synchronizes legacy completion', async () => {
  const { service, state } = makeContext({ receipt: false });
  const result = await service.confirm({ userUid: 'user-1', roleName: 'Investor' }, {
    chainId: 11155111,
    txHash: TX_HASH,
    tokenUid: '02647af2-e585-4c03-8984-108e1e44c616',
    expectedAction: 'INVEST',
  });
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(state.rows.size, 1);
  assert.equal(state.syncCount, 0);
});

test('canonical indexer discovers a controller transaction and advances the global checkpoint once', async () => {
  const paymentLog = encodedLog(paymentInterface, 'Transfer', [INVESTOR, ISSUER, 5_000_000n], USDT, 4);
  const state = { checkpoint: { startBlock: 100, lastIndexedBlock: 0, lastIndexedBlockHash: null }, synchronized: [] };
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }), getBlockNumber: async () => 102,
    getLogs: async (filter) => (String(filter.address).toLowerCase().includes(USDT.toLowerCase()) ? [paymentLog] : []),
    getTransaction: async () => ({ hash: TX_HASH, to: CONTROLLER }),
    getBlock: async (number) => ({ number, hash: `0x${String(number).padStart(64, '0')}` }),
    destroy: () => {},
  };
  const checkpointRepository = {
    ensureCheckpoint: async (_name, _chainId, startBlock) => { state.checkpoint.startBlock = startBlock; },
    acquireLease: async () => true,
    findCheckpoint: async () => ({ ...state.checkpoint }),
    advanceCheckpoint: async (_name, _chainId, _owner, block, hash) => {
      state.checkpoint.lastIndexedBlock = block; state.checkpoint.lastIndexedBlockHash = hash; return true;
    },
    releaseLease: async () => true,
  };
  const service = new BlockchainTransactionIndexerService({
    settingRepository: { findByKey: async () => null },
    repository: {
      listIndexedTokens: async () => [{ tokenUid: 'token-1', tokenAddress: TOKEN, deployedAtBlock: 100 }],
      markOrphanedFromBlock: async () => {},
    },
    checkpointRepository,
    transactionService: {
      paymentAddress: () => USDT, controllerAddress: () => CONTROLLER,
      synchronize: async (candidate) => { state.synchronized.push(candidate); return { status: 'CONFIRMED' }; },
    },
    config: {
      transactionIndexerEnabled: true, transactionIndexerStartBlock: 100,
      transactionIndexerConfirmations: 2, sepoliaRpcUrl: 'rpc', chainId: 11155111,
    },
    dependencies: { providerFactory: () => provider },
  });
  const result = await service.run();
  assert.equal(result.confirmed, 1);
  assert.equal(state.synchronized.length, 1);
  assert.equal(state.synchronized[0].txHash, TX_HASH);
  assert.equal(state.checkpoint.lastIndexedBlock, 101);
});

test('a newly discovered token is backfilled behind the global checkpoint', async () => {
  const transferLog = encodedLog(tokenInterface, 'Transfer', [INVESTOR, ISSUER, 25n], TOKEN, 7);
  transferLog.blockNumber = 95;
  const state = { synchronized: [], advancedBackfill: null };
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }), getBlockNumber: async () => 102,
    getLogs: async (filter) => {
      const tokenFilter = Array.isArray(filter.address) && filter.address.some((item) => item === TOKEN);
      return tokenFilter && filter.fromBlock <= 95 && filter.toBlock >= 95 ? [transferLog] : [];
    },
    getTransaction: async () => ({ hash: TX_HASH, to: TOKEN }),
    getBlock: async (number) => ({ number, hash: `0x${String(number).padStart(64, '0')}` }), destroy: () => {},
  };
  const service = new BlockchainTransactionIndexerService({
    settingRepository: { findByKey: async () => null },
    repository: {
      listIndexedTokens: async () => [{ tokenUid: 'token-1', tokenAddress: TOKEN, deployedAtBlock: 90 }],
      registerIndexedTokens: async () => {},
      listContractsRequiringBackfill: async () => [{
        indexedContractUid: 'contract-1', tokenUid: 'token-1', contractAddress: TOKEN,
        startBlock: 90, lastBackfilledBlock: 89,
      }],
      advanceContractBackfill: async (_uid, block, complete) => { state.advancedBackfill = { block, complete }; },
      markOrphanedFromBlock: async () => {},
    },
    checkpointRepository: {
      ensureCheckpoint: async () => {}, acquireLease: async () => true,
      findCheckpoint: async () => ({ startBlock: 1, lastIndexedBlock: 100, lastIndexedBlockHash: null }),
      advanceCheckpoint: async () => true, releaseLease: async () => true,
    },
    transactionService: {
      paymentAddress: () => USDT, controllerAddress: () => CONTROLLER,
      synchronize: async (candidate) => { state.synchronized.push(candidate); return { status: 'CONFIRMED' }; },
    },
    config: {
      transactionIndexerEnabled: true, transactionIndexerConfirmations: 2,
      sepoliaRpcUrl: 'rpc', chainId: 11155111,
    },
    dependencies: { providerFactory: () => provider },
  });
  const result = await service.run();
  assert.equal(result.backfillBlocksScanned, 11);
  assert.equal(state.synchronized[0].expectedAction, 'TRANSFER');
  assert.deepEqual(state.advancedBackfill, { block: 100, complete: true });
});
