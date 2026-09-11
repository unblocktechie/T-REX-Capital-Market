const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  IdentityRegistryVerifierService,
  IDENTITY_REGISTRY_ABI,
  DELEGATION_MANAGER_ABI,
  SINGLE_EXECUTION_MODE,
} = require('../../src/services/blockchain/identity-registry-verifier.service');

const REGISTRY = '0x1111111111111111111111111111111111111111';
const ISSUER = '0x2222222222222222222222222222222222222222';
const INVESTOR = '0x3333333333333333333333333333333333333333';
const IDENTITY = '0x4444444444444444444444444444444444444444';
const DELEGATION_MANAGER = '0x5555555555555555555555555555555555555555';
const TX = `0x${'ab'.repeat(32)}`;
const BLOCK_HASH = `0x${'cd'.repeat(32)}`;
const iface = new ethers.Interface(IDENTITY_REGISTRY_ABI);
const delegationInterface = new ethers.Interface(DELEGATION_MANAGER_ABI);

const expected = {
  txHash: TX,
  chainId: 11155111,
  identityRegistryAddress: REGISTRY,
  issuerWalletAddress: ISSUER,
  investorWalletAddress: INVESTOR,
  investorIdentityAddress: IDENTITY,
  countryCode: 356,
};

const delegatedData = ({
  target = REGISTRY,
  args = [INVESTOR, IDENTITY, 356],
  nestedValue = 0n,
  mode = SINGLE_EXECUTION_MODE,
  payloads = null,
} = {}) => {
  const callData = iface.encodeFunctionData('registerIdentity', args);
  const execution = ethers.concat([
    target,
    ethers.zeroPadValue(ethers.toBeHex(nestedValue), 32),
    callData,
  ]);
  const executionPayloads = payloads || [execution];
  return delegationInterface.encodeFunctionData('redeemDelegations', [
    executionPayloads.map(() => '0x1234'),
    executionPayloads.map(() => mode),
    executionPayloads,
  ]);
};

const makeVerifier = ({
  to = REGISTRY,
  from = ISSUER,
  args = [INVESTOR, IDENTITY, 356],
  data = null,
  value = 0n,
  status = 1,
  includeEvent = true,
  canonicalBlockHash = BLOCK_HASH,
  delegationManagers = [DELEGATION_MANAGER],
} = {}) => {
  const event = iface.encodeEventLog(iface.getEvent('IdentityRegistered'), [INVESTOR, IDENTITY]);
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
    getTransaction: async () => ({
      to, from, chainId: 11155111n, value,
      data: data || iface.encodeFunctionData('registerIdentity', args),
    }),
    getTransactionReceipt: async () => ({
      status, blockNumber: 100, blockHash: BLOCK_HASH, index: 2,
      logs: includeEvent ? [{ address: REGISTRY, topics: event.topics, data: event.data, index: 7 }] : [],
    }),
    getBlockNumber: async () => 120,
    getBlock: async () => ({ hash: canonicalBlockHash }),
    getLogs: async () => [{
      address: REGISTRY, topics: event.topics, data: event.data, transactionHash: TX,
      blockNumber: 100, blockHash: BLOCK_HASH, transactionIndex: 2, index: 7,
    }],
    destroy() {},
  };
  const contract = {
    contains: async () => true,
    identity: async () => IDENTITY,
    investorCountry: async () => 356,
    isAgent: async () => true,
  };
  return new IdentityRegistryVerifierService(
    {
      sepoliaRpcUrl: 'mock', chainId: 11155111, supportedChainIds: [11155111], confirmations: 2,
      registryDelegationManagerAddresses: delegationManagers,
    },
    { providerFactory: () => provider, contractFactory: () => contract },
  );
};

test('registry verifier proves sender, target, calldata, event, receipt, and final state', async () => {
  const result = await makeVerifier().verifyRegistration(expected);
  assert.equal(result.txHash, TX);
  assert.equal(result.blockNumber, 100);
  assert.equal(result.transactionIndex, 2);
  assert.equal(result.logIndex, 7);
});

test('registry verifier rejects another registry, sender, parameters, reverted receipt, and missing event', async () => {
  await assert.rejects(
    makeVerifier({ to: IDENTITY }).verifyRegistration(expected),
    (error) => error.code === 'INVALID_REGISTRY_CONTRACT',
  );
  await assert.rejects(
    makeVerifier({ from: INVESTOR }).verifyRegistration(expected),
    (error) => error.code === 'UNAUTHORIZED_TRANSACTION_SENDER',
  );
  await assert.rejects(
    makeVerifier({ args: [ISSUER, IDENTITY, 356] }).verifyRegistration(expected),
    (error) => error.code === 'REGISTRY_PARAMETERS_MISMATCH',
  );
  await assert.rejects(
    makeVerifier({ status: 0 }).verifyRegistration(expected),
    (error) => error.code === 'TRANSACTION_FAILED',
  );
  await assert.rejects(
    makeVerifier({ includeEvent: false }).verifyRegistration(expected),
    (error) => error.code === 'REGISTRY_EVENT_MISSING',
  );
});

test('registry verifier accepts a strictly decoded MetaMask-style delegated registration', async () => {
  const result = await makeVerifier({
    to: DELEGATION_MANAGER,
    data: delegatedData(),
  }).verifyRegistration(expected);

  assert.equal(result.executionType, 'DELEGATED');
  assert.equal(result.txHash, TX);
  assert.equal(result.blockNumber, 100);
});

test('registry verifier rejects an unapproved executor and mismatching delegated target', async () => {
  await assert.rejects(
    makeVerifier({
      to: '0x6666666666666666666666666666666666666666',
      data: delegatedData(),
    }).verifyRegistration(expected),
    (error) => error.code === 'INVALID_REGISTRY_CONTRACT',
  );
  await assert.rejects(
    makeVerifier({
      to: DELEGATION_MANAGER,
      data: delegatedData({ target: IDENTITY }),
    }).verifyRegistration(expected),
    (error) => error.code === 'INVALID_REGISTRY_CONTRACT',
  );
});

test('registry verifier rejects delegated parameter, value, mode, and batch mismatches', async () => {
  await assert.rejects(
    makeVerifier({
      to: DELEGATION_MANAGER,
      data: delegatedData({ args: [ISSUER, IDENTITY, 356] }),
    }).verifyRegistration(expected),
    (error) => error.code === 'REGISTRY_PARAMETERS_MISMATCH',
  );
  await assert.rejects(
    makeVerifier({
      to: DELEGATION_MANAGER,
      data: delegatedData({ nestedValue: 1n }),
    }).verifyRegistration(expected),
    (error) => error.code === 'UNEXPECTED_TRANSACTION_VALUE',
  );
  await assert.rejects(
    makeVerifier({
      to: DELEGATION_MANAGER,
      data: delegatedData({ mode: `0x${'01'.padStart(64, '0')}` }),
    }).verifyRegistration(expected),
    (error) => error.code === 'UNSUPPORTED_DELEGATED_REGISTRY_EXECUTION',
  );
  const duplicatePayload = ethers.concat([
    REGISTRY,
    ethers.zeroPadValue(ethers.toBeHex(0), 32),
    iface.encodeFunctionData('registerIdentity', [INVESTOR, IDENTITY, 356]),
  ]);
  await assert.rejects(
    makeVerifier({
      to: DELEGATION_MANAGER,
      data: delegatedData({ payloads: [duplicatePayload, duplicatePayload] }),
    }).verifyRegistration(expected),
    (error) => error.code === 'UNSUPPORTED_DELEGATED_REGISTRY_EXECUTION',
  );
});

test('registry verifier rejects non-zero outer value and a non-canonical receipt block', async () => {
  await assert.rejects(
    makeVerifier({ value: 1n }).verifyRegistration(expected),
    (error) => error.code === 'UNEXPECTED_TRANSACTION_VALUE',
  );
  await assert.rejects(
    makeVerifier({ canonicalBlockHash: `0x${'ef'.repeat(32)}` }).verifyRegistration(expected),
    (error) => error.code === 'CHAIN_REORGANIZATION' && error.pending === true,
  );
});

test('registry verifier validates the current registry state and issuer agent role', async () => {
  const state = await makeVerifier().inspectRegistryState(expected);
  assert.equal(state.contains, true);
  assert.equal(state.matches, true);
  assert.equal(state.issuerIsAgent, true);
});

test('registry verifier finds the exact historical registration event in a bounded safe range', async () => {
  const event = await makeVerifier().findRegistrationEvent(expected, { fromBlock: 50 });
  assert.equal(event.txHash, TX);
  assert.equal(event.blockNumber, 100);
  assert.equal(event.investorWalletAddress, INVESTOR);
  assert.equal(event.investorIdentityAddress, IDENTITY);
});

test('historical registration lookup fails over when the primary RPC returns an empty log result', async () => {
  const encoded = iface.encodeEventLog(iface.getEvent('IdentityRegistered'), [INVESTOR, IDENTITY]);
  const providerFactory = (url) => ({
    getNetwork: async () => ({ chainId: 11155111n }),
    getBlockNumber: async () => 120,
    getLogs: async () => (url === 'primary' ? [] : [{
      address: REGISTRY, topics: encoded.topics, data: encoded.data, transactionHash: TX,
      blockNumber: 100, blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: 2, index: 7,
    }]),
    destroy() {},
  });
  const verifier = new IdentityRegistryVerifierService({
    sepoliaRpcUrl: 'primary', sepoliaFallbackRpcUrls: ['fallback'], chainId: 11155111,
    supportedChainIds: [11155111], registryConfirmations: 2, registryRpcEvidenceAttempts: 1,
  }, { providerFactory });

  const event = await verifier.findRegistrationEvent(expected, { fromBlock: 50 });

  assert.equal(event.txHash, TX);
  assert.equal(event.blockNumber, 100);
});
