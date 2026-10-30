const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequireInvestorChain } = require('../../src/middleware/investor-chain.middleware');

const CHAIN_UID = '60000000-0000-4000-8000-000000000001';

const invoke = async ({ roleName = 'Investor', header = CHAIN_UID } = {}) => {
  let nextError;
  let nextCalled = false;
  const middleware = createRequireInvestorChain({
    byUid: async (chainUid) => ({ chainUid, chainId: 11155111, chainName: 'Sepolia' }),
  });
  const req = {
    user: { roleName },
    get: (name) => (name === 'X-Chain-Uid' ? header : undefined),
  };
  await middleware(req, {}, (error) => { nextError = error; nextCalled = true; });
  return { req, nextError, nextCalled };
};

test('investor selected-chain middleware resolves and attaches the active chain', async () => {
  const result = await invoke();
  assert.equal(result.nextError, undefined);
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.selectedChain.chainUid, CHAIN_UID);
  assert.equal(result.req.selectedChain.chainId, 11155111);
});

test('investor selected-chain middleware rejects a missing chain header', async () => {
  const result = await invoke({ header: '' });
  assert.equal(result.nextError.code, 'SELECTED_CHAIN_REQUIRED');
  assert.equal(result.nextError.statusCode, 400);
});

test('issuer selected-chain middleware resolves and attaches the active chain', async () => {
  const result = await invoke({ roleName: 'Issuer' });
  assert.equal(result.nextError, undefined);
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.selectedChain.chainUid, CHAIN_UID);
});

test('issuer selected-chain middleware rejects a missing chain header', async () => {
  const result = await invoke({ roleName: 'Issuer', header: '' });
  assert.equal(result.nextError.code, 'SELECTED_CHAIN_REQUIRED');
  assert.equal(result.nextError.statusCode, 400);
});

test('selected-chain middleware does not change admin requests', async () => {
  const result = await invoke({ roleName: 'Super Administrator', header: '' });
  assert.equal(result.nextError, undefined);
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.selectedChain, undefined);
});
