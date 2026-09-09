const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const { ClaimStateService, buildOnchainClaimId } = require('../../src/services/blockchain/claim-state.service');

const INVESTOR = `0x${'11'.repeat(20)}`;
const ISSUER = `0x${'22'.repeat(20)}`;
const DATA = '0x4b59435f415050524f564544';
const SIGNATURE = `0x${'ab'.repeat(65)}`;

const makeService = (claim) => {
  const state = { requestedClaimId: null, destroyed: false };
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
    destroy: () => { state.destroyed = true; },
  };
  const service = new ClaimStateService(
    { sepoliaRpcUrl: 'http://rpc', chainId: 11155111, supportedChainIds: [11155111] },
    {
      providerFactory: () => provider,
      contractFactory: () => ({
        getClaim: async (claimId) => { state.requestedClaimId = claimId; return claim; },
      }),
    },
  );
  return { service, state };
};

test('claim state lookup validates the exact ONCHAINID claim in one contract read', async () => {
  const { service, state } = makeService({
    topic: 1n, scheme: 1n, issuer: ISSUER, signature: SIGNATURE, data: DATA, uri: '',
  });
  const result = await service.inspectClaim({
    investorIdentityAddress: INVESTOR,
    issuerIdentityAddress: ISSUER,
    claimTopic: 1,
    data: DATA,
    signature: SIGNATURE,
  });
  assert.equal(state.requestedClaimId, buildOnchainClaimId(ISSUER, 1));
  assert.equal(result.exists, true);
  assert.equal(result.matches, true);
  assert.equal(result.mismatchReason, null);
  assert.equal(state.destroyed, true);
});

test('claim state lookup reports an absent claim without treating zero values as a match', async () => {
  const { service } = makeService({
    topic: 0n, scheme: 0n, issuer: ethers.ZeroAddress, signature: '0x', data: '0x', uri: '',
  });
  const result = await service.inspectClaim({
    investorIdentityAddress: INVESTOR,
    issuerIdentityAddress: ISSUER,
    claimTopic: 1,
    data: DATA,
    signature: SIGNATURE,
  });
  assert.deepEqual({ exists: result.exists, matches: result.matches }, { exists: false, matches: false });
});

test('claim state lookup identifies an exact-field mismatch', async () => {
  const { service } = makeService({
    topic: 1n, scheme: 1n, issuer: ISSUER, signature: SIGNATURE, data: '0xdeadbeef', uri: '',
  });
  const result = await service.inspectClaim({
    investorIdentityAddress: INVESTOR,
    issuerIdentityAddress: ISSUER,
    claimTopic: 1,
    data: DATA,
    signature: SIGNATURE,
  });
  assert.equal(result.exists, true);
  assert.equal(result.matches, false);
  assert.equal(result.mismatchReason, 'data');
});
