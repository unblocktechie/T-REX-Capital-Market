const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const { TrexDeploymentSyncService } = require('../../src/services/blockchain/trex-deployment-sync.service');
const { trexFactoryEventAbi } = require('../../src/services/blockchain/token-deployment-receipt.service');

const FACTORY = '0xe221247C52ece62027eb7D01D0f522d7363Fe875';
const OWNER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const TX = `0x${'a'.repeat(64)}`;

const factoryInterface = new ethers.Interface(trexFactoryEventAbi);
const encoded = factoryInterface.encodeEventLog(factoryInterface.getEvent('TREXSuiteDeployed'), [
  TOKEN,
  '0x3333333333333333333333333333333333333333',
  '0x4444444444444444444444444444444444444444',
  '0x5555555555555555555555555555555555555555',
  '0x6666666666666666666666666666666666666666',
  '0x7777777777777777777777777777777777777777',
  'salt-abc',
]);
const deployedLog = {
  address: FACTORY,
  topics: encoded.topics,
  data: encoded.data,
  transactionHash: TX,
  blockNumber: 100,
};

const config = {
  sepoliaRpcUrl: 'https://sepolia.example.test',
  trexFactoryAddress: FACTORY,
  deploymentSyncEnabled: true,
};

const makeSettings = (overrides = {}) => {
  const store = {
    TrexDeploymentSyncInterval: '60',
    TrexDeploymentLastSyncBlock: '0',
    TrexDeploymentBlockOffset: '500',
    TrexDeploymentConfirmationBlocks: '12',
    TrexDeploymentStartBlock: '0',
    TrexDeploymentSyncEnabled: 'true',
    ...overrides,
  };
  return {
    store,
    async findByKey(key) { return key in store ? { settingKey: key, settingValue: store[key] } : null; },
    async setValueByKey(key, value) { store[key] = String(value); return true; },
  };
};

const makeProvider = (overrides = {}) => ({
  getBlockNumber: overrides.getBlockNumber || (async () => 120),
  getLogs: overrides.getLogs || (async ({ fromBlock, toBlock }) => ((fromBlock <= 100 && toBlock >= 100) ? [deployedLog] : [])),
  getBlock: overrides.getBlock || (async () => ({ timestamp: 1785456000 })),
  getTransaction: overrides.getTransaction || (async () => ({ from: OWNER })),
  destroy() {},
});

const makeService = ({
  settings = makeSettings(),
  provider = makeProvider(),
  token = { tokenUid: 'token-1', userUid: 'user-1', organizationUid: 'org-1', status: 'deploymentPending', tokenName: 'My Token', tokenSymbol: 'MTK', tokenAddress: null },
  organization = { organizationUid: 'org-1', walletAddress: OWNER },
  tokenInfo = { owner: OWNER, name: 'My Token', symbol: 'MTK' },
  captured = {},
} = {}) => {
  const service = new TrexDeploymentSyncService({
    settingRepository: settings,
    organizationRepository: { findByWalletAddress: async (w) => (organization && w === organization.walletAddress.toLowerCase() ? organization : null) },
    tokenRepository: {
      findByOrganizationUid: async () => token,
      findByUserUid: async () => token,
      findByTokenAddressExcept: async () => null,
      findByDeployTxHashExcept: async () => null,
      updateDeploymentByUserUid: async (userUid, fields) => { captured.update = { userUid, fields }; return { ...token, ...fields }; },
    },
    attemptRepository: { findByTokenAndHash: async () => null, findActiveByToken: async () => null, update: async () => ({}) },
    config,
    transactionRunner: (work) => work({}),
    dependencies: {
      providerFactory: () => provider,
      tokenReader: async () => tokenInfo,
      retryBaseDelayMs: 1,
    },
  });
  return { service, captured, settings };
};

test('discovers a TREXSuiteDeployed event and synchronizes the matching pending token', async () => {
  const { service, captured, settings } = makeService();
  const stats = await service.run();
  assert.equal(stats.eventsFound, 1);
  assert.equal(stats.synced, 1);
  assert.equal(captured.update.fields.status, 'deployed');
  assert.equal(captured.update.fields.tokenAddress, TOKEN);
  assert.equal(captured.update.fields.deployTxHash, TX);
  assert.equal(captured.update.fields.deployedAtBlock, 100);
  assert.ok(/^0x[0-9a-f]{64}$/i.test(captured.update.fields.deploymentSalt));
  // checkpoint advanced to the safe head (120 - 12)
  assert.equal(settings.store.TrexDeploymentLastSyncBlock, '108');
});

test('is idempotent when the token is already deployed at the same address', async () => {
  const { service, captured } = makeService({
    token: { tokenUid: 'token-1', userUid: 'user-1', organizationUid: 'org-1', status: 'deployed', tokenName: 'My Token', tokenSymbol: 'MTK', tokenAddress: TOKEN },
  });
  const stats = await service.run();
  assert.equal(stats.synced, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(captured.update, undefined);
});

test('skips when no organization owns the on-chain token owner wallet', async () => {
  const { service, captured } = makeService({ organization: null });
  const stats = await service.run();
  assert.equal(stats.synced, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(captured.update, undefined);
});

test('skips when on-chain name/symbol do not match the database record', async () => {
  const { service, captured } = makeService({ tokenInfo: { owner: OWNER, name: 'Different', symbol: 'XXX' } });
  const stats = await service.run();
  assert.equal(stats.skipped, 1);
  assert.equal(captured.update, undefined);
});

test('does nothing when the checkpoint already covers the safe head', async () => {
  let getLogsCalled = false;
  const { service } = makeService({
    settings: makeSettings({ TrexDeploymentLastSyncBlock: '108' }),
    provider: makeProvider({ getLogs: async () => { getLogsCalled = true; return []; } }),
  });
  const stats = await service.run();
  assert.equal(stats.synced, 0);
  assert.equal(getLogsCalled, false);
});

test('does not run when disabled via the general setting', async () => {
  const { service } = makeService({ settings: makeSettings({ TrexDeploymentSyncEnabled: 'false' }) });
  const stats = await service.run();
  assert.equal(stats.enabled, false);
  assert.equal(stats.synced, 0);
});

test('retries transient getLogs failures with backoff, then processes', async () => {
  let calls = 0;
  const provider = makeProvider({
    getLogs: async ({ fromBlock, toBlock }) => {
      calls += 1;
      if (calls === 1) throw new Error('RPC timeout');
      return (fromBlock <= 100 && toBlock >= 100) ? [deployedLog] : [];
    },
  });
  const { service } = makeService({ provider });
  const stats = await service.run();
  assert.ok(stats.retries >= 1);
  assert.equal(stats.synced, 1);
});

test('a persistent getLogs failure does not advance the checkpoint', async () => {
  const provider = makeProvider({ getLogs: async () => { throw new Error('RPC unavailable'); } });
  const { service, settings } = makeService({ provider });
  const stats = await service.run();
  assert.equal(stats.synced, 0);
  assert.ok(stats.errors >= 1);
  // checkpoint stays at its original value (0) so the next run resumes from the same block
  assert.equal(settings.store.TrexDeploymentLastSyncBlock, '0');
});
