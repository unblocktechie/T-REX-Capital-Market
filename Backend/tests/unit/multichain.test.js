const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const { env } = require('../../src/core/config/env');
const { encryptSecret } = require('../../src/utils/secret-crypto');
const { ChainRuntimeService } = require('../../src/services/chain-runtime.service');
const { MultiChainRunnerService } = require('../../src/services/blockchain/multi-chain-runner.service');
const { UserChainIdentityService } = require('../../src/services/user-chain-identity.service');

const CHAIN_UID = '60000000-0000-4000-8000-000000000001';
const WALLET = '0x1111111111111111111111111111111111111111';
const IDENTITY = '0x2222222222222222222222222222222222222222';

const chainRow = (overrides = {}) => ({
  chainUid: CHAIN_UID,
  chainCode: 'SEPOLIA',
  chainName: 'Ethereum Sepolia',
  chainId: 11155111,
  networkName: 'sepolia',
  rpcUrl: 'https://rpc.example.test',
  fallbackRpcUrls: '[]',
  publicRpcUrl: 'https://public.example.test',
  identityFactoryAddress: '0x3333333333333333333333333333333333333333',
  platformControllerAddress: '0x4444444444444444444444444444444444444444',
  trexFactoryAddress: '0x5555555555555555555555555555555555555555',
  deployerAddress: WALLET,
  confirmations: 2,
  registryConfirmations: 2,
  indexersEnabled: 1,
  isActive: 1,
  isDeleted: 0,
  ...overrides,
});

test('chain runtime decrypts a write-only signer and maps chain-scoped settings', async () => {
  env.chainSecrets.encryptionKey = 'multichain-test-encryption-key-that-is-long-enough';
  const wallet = ethers.Wallet.createRandom();
  const row = chainRow({
    deployerAddress: wallet.address,
    deployerPrivateKeyEncrypted: encryptSecret(wallet.privateKey),
  });
  const service = new ChainRuntimeService({
    repository: { findRawByUid: async () => row },
  });
  const runtime = await service.byUid(CHAIN_UID);
  assert.equal(runtime.chainId, 11155111);
  assert.equal(runtime.sepoliaRpcUrl, row.rpcUrl);
  assert.equal(runtime.deployerPrivateKey, wallet.privateKey);
  assert.equal(service.requireSigner(runtime).deployerAddress, wallet.address);
});

test('multi-chain runner isolates one chain failure and continues other chains', async () => {
  const service = new MultiChainRunnerService({
    chainRuntimeService: {
      listActiveRuntime: async () => [
        { chainUid: 'chain-a', chainId: 1, transactionIndexerEnabled: true },
        { chainUid: 'chain-b', chainId: 2, transactionIndexerEnabled: true },
      ],
    },
    settingRepository: { findByKey: async () => null },
    name: 'test indexer',
    factory: (config) => ({
      run: async () => {
        if (config.chainId === 1) throw new Error('RPC unavailable');
        return { confirmed: 3 };
      },
    }),
  });
  const result = await service.run();
  assert.equal(result.chainCount, 2);
  assert.equal(result.results[0].error, 'RPC unavailable');
  assert.equal(result.results[1].confirmed, 3);
});

test('chain unlock is idempotent and never creates a second ONCHAINID', async () => {
  let createCalls = 0;
  const existing = {
    userUid: 'user-1', chainUid: CHAIN_UID, chainId: 11155111, roleName: 'Investor',
    walletAddress: WALLET, identityAddress: IDENTITY,
    identityFactoryAddress: chainRow().identityFactoryAddress, status: 'CREATED', isUnlocked: true,
  };
  const service = new UserChainIdentityService({
    repository: {
      find: async () => existing,
      listByUser: async () => [existing],
    },
    chainRuntimeService: {
      byUid: async () => chainRow(),
      requireSigner: (config) => config,
      listPublic: async () => [],
    },
    identityService: { createOrganizationIdentity: async () => { createCalls += 1; } },
    investorRepository: { findByUserUid: async () => ({ status: 'submitted', walletAddress: WALLET }) },
    organizationRepository: { findByUserUid: async () => null },
  });
  const result = await service.createOrGet({
    user: { userUid: 'user-1', roleName: 'Investor' }, chainUid: CHAIN_UID,
  });
  assert.equal(result.identityAddress, IDENTITY);
  assert.equal(createCalls, 0);
});

test('chain unlock replaces identity evidence when the configured Identity Factory changed', async () => {
  const oldFactory = '0x6666666666666666666666666666666666666666';
  const currentFactory = chainRow().identityFactoryAddress;
  let record = {
    userUid: 'user-1', chainUid: CHAIN_UID, chainId: 11155111, roleName: 'Investor',
    walletAddress: WALLET, identityAddress: IDENTITY, identityFactoryAddress: oldFactory,
    creationTxHash: `0x${'a'.repeat(64)}`, status: 'CREATED', isUnlocked: true,
  };
  let invalidated = false;
  let profileUpdate;
  const repository = {
    find: async () => record,
    invalidateForFactoryChange: async (_userUid, _chainUid, factory) => {
      invalidated = true;
      record = {
        ...record, identityFactoryAddress: factory, identityAddress: null,
        creationTxHash: null, status: 'FAILED', isUnlocked: false,
      };
      return record;
    },
    reserve: async () => ({ record: { ...record, status: 'CREATING' }, reservationAcquired: true }),
    markCreated: async (_userUid, _chainUid, result) => {
      record = {
        ...record, identityAddress: result.identityAddress, creationTxHash: result.txHash,
        status: 'CREATED', isUnlocked: true,
      };
      return record;
    },
  };
  const service = new UserChainIdentityService({
    repository,
    chainRuntimeService: {
      byUid: async () => chainRow(),
      requireSigner: (config) => config,
    },
    identityService: {
      createOrganizationIdentity: async () => ({
        identityAddress: '0x7777777777777777777777777777777777777777',
        txHash: `0x${'b'.repeat(64)}`,
      }),
    },
    investorRepository: {
      findByUserUid: async () => ({
        investorUid: 'investor-1', status: 'submitted', walletAddress: WALLET,
        onboardingChainUid: CHAIN_UID,
      }),
      updateByUserUid: async (_userUid, update) => { profileUpdate = update; },
    },
    organizationRepository: { findByUserUid: async () => null },
  });

  const result = await service.createOrGet({
    user: { userUid: 'user-1', roleName: 'Investor' }, chainUid: CHAIN_UID,
  });

  assert.equal(invalidated, true);
  assert.equal(result.identityFactoryAddress, currentFactory);
  assert.equal(result.identityAddress, '0x7777777777777777777777777777777777777777');
  assert.equal(profileUpdate.contractAddress, result.identityAddress);
  assert.equal(profileUpdate.onchainIdReference, result.identityAddress);
  assert.equal(profileUpdate.contractTxnHash, result.creationTxHash);
});

test('concurrent chain unlock reports creation in progress instead of broadcasting twice', async () => {
  const service = new UserChainIdentityService({
    repository: {
      find: async () => null,
      reserve: async () => ({
        reservationAcquired: false,
        record: { status: 'CREATING', chainUid: CHAIN_UID, walletAddress: WALLET },
      }),
    },
    chainRuntimeService: {
      byUid: async () => chainRow({ deployerPrivateKeyEncrypted: 'not-used' }),
      requireSigner: (config) => config,
    },
    identityService: { createOrganizationIdentity: async () => assert.fail('must not broadcast') },
    investorRepository: { findByUserUid: async () => ({ status: 'submitted', walletAddress: WALLET }) },
    organizationRepository: { findByUserUid: async () => null },
  });
  await assert.rejects(
    () => service.createOrGet({ user: { userUid: 'user-1', roleName: 'Investor' }, chainUid: CHAIN_UID }),
    (error) => error.code === 'CHAIN_IDENTITY_CREATION_IN_PROGRESS' && error.statusCode === 409,
  );
});
