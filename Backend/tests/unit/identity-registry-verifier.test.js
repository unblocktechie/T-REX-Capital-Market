const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  IdentityRegistryVerifierService,
  IDENTITY_REGISTRY_ABI,
} = require('../../src/services/blockchain/identity-registry-verifier.service');

const REGISTRY = '0x1111111111111111111111111111111111111111';
const ISSUER = '0x2222222222222222222222222222222222222222';
const INVESTOR = '0x3333333333333333333333333333333333333333';
const IDENTITY = '0x4444444444444444444444444444444444444444';
const TX = `0x${'ab'.repeat(32)}`;
const iface = new ethers.Interface(IDENTITY_REGISTRY_ABI);

const expected = {
  txHash: TX,
  chainId: 11155111,
  identityRegistryAddress: REGISTRY,
  issuerWalletAddress: ISSUER,
  investorWalletAddress: INVESTOR,
  investorIdentityAddress: IDENTITY,
  countryCode: 356,
};

const makeVerifier = ({ to = REGISTRY, from = ISSUER, args = [INVESTOR, IDENTITY, 356], status = 1, includeEvent = true } = {}) => {
  const event = iface.encodeEventLog(iface.getEvent('IdentityRegistered'), [INVESTOR, IDENTITY]);
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
    getTransaction: async () => ({
      to, from, chainId: 11155111n, value: 0n,
      data: iface.encodeFunctionData('registerIdentity', args),
    }),
    getTransactionReceipt: async () => ({
      status, blockNumber: 100, blockHash: `0x${'cd'.repeat(32)}`, index: 2,
      logs: includeEvent ? [{ address: REGISTRY, topics: event.topics, data: event.data, index: 7 }] : [],
    }),
    getBlockNumber: async () => 120,
    destroy() {},
  };
  const contract = {
    contains: async () => true,
    identity: async () => IDENTITY,
    investorCountry: async () => 356,
    isAgent: async () => true,
  };
  return new IdentityRegistryVerifierService(
    { sepoliaRpcUrl: 'mock', chainId: 11155111, supportedChainIds: [11155111], confirmations: 2 },
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

test('registry verifier validates the current registry state and issuer agent role', async () => {
  const state = await makeVerifier().inspectRegistryState(expected);
  assert.equal(state.contains, true);
  assert.equal(state.matches, true);
  assert.equal(state.issuerIsAgent, true);
});
