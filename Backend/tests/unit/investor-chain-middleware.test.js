const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequireInvestorChain } = require('../../src/middleware/investor-chain.middleware');

const CHAIN_UID = '60000000-0000-4000-8000-000000000001';

const invokeApiKey = async (publicId, legacyUid, byChainId = async (chainId) => ({ chainId, chainUid: CHAIN_UID })) => {
  const req = { user: { roleName: 'Issuer' }, auth: { type: 'issuerApiKey' },
    get: (name) => ({ 'X-Chain-Id': publicId, 'X-Chain-Uid': legacyUid })[name] };
  let error;
  await createRequireInvestorChain({ byChainId })(req, {}, (e) => { error = e; });
  return { req, error };
};

test('issuer API key resolves public chain ID without requiring a platform identifier', async () => {
  const { req, error } = await invokeApiKey('11155111');
  assert.equal(error, undefined);
  assert.equal(req.selectedChain.chainUid, CHAIN_UID);
  assert.equal(req.selectedChain.chainId, 11155111);
});

test('API key requires public ID even when a legacy header exists', async () => {
  const { error } = await invokeApiKey(undefined, CHAIN_UID);
  assert.equal(error.code, 'SELECTED_CHAIN_REQUIRED');
});

test('API key rejects malformed public chain IDs before lookup', async () => {
  for (const value of ['0', '-1', '1.5', '0xaa36a7', '1e7', '11155111,421614', '9007199254740992', CHAIN_UID]) {
    const { error } = await invokeApiKey(value, undefined, async () => assert.fail('must not query'));
    assert.equal(error.code, 'INVALID_SELECTED_CHAIN');
  }
});

test('API key propagates unsupported/inactive-chain rejection', async () => {
  const failure = new Error('Unsupported chain');
  failure.code = 'UNSUPPORTED_CHAIN';
  const { error } = await invokeApiKey('999', undefined, async () => { throw failure; });
  assert.equal(error, failure);
});

test('API key rejects conflicting chain headers', async () => {
  assert.equal((await invokeApiKey('11155111', 'different')).error.code, 'SELECTED_CHAIN_MISMATCH');
  assert.equal((await invokeApiKey('11155111', CHAIN_UID)).error, undefined);
});

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
