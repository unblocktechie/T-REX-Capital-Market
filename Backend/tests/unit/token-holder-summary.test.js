const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenHolderSummaryService } = require('../../src/services/blockchain/token-holder-summary.service');
const token = { tokenUid: 't1', chainUid: 'c1', chainId: 1, tokenAddress: `0x${'1'.repeat(40)}` };
const wallets = [2, 3, 4].map(n => ({ walletAddress: `0x${String(n).repeat(40)}` }));
function fixture(over = {}) {
  const state = { reads: 0, queries: 0 };
  const service = new TokenHolderSummaryService({
    chainRepository: { findRawByUid: async () => ({ chainId: 1, rpcUrl: 'rpc' }) },
    query: async (sql, params) => {
      state.queries++; assert.deepEqual(params, ['t1', 1, 't1', 1]);
      assert.match(sql, /isCanonical=1/); assert.match(sql, /status='COMPLETED'/);
      return wallets;
    },
    providerFactory: () => ({ getNetwork: async () => ({ chainId: 1n }), getBlock: async () => ({ number: 123, hash: 'hash' }), destroy() {} }),
    contractFactory: () => ({ balanceOf: async (wallet, options) => {
      state.reads++; assert.equal(options.blockTag, 123);
      if (wallet === wallets[2].walletAddress) throw new Error('rate limited');
      return wallet === wallets[0].walletAddress ? 900719925474099300000n : 0n;
    } }), ...over,
  });
  return { service, state };
}
test('holder summary uses exact balances and separates unknown; cache and single-flight avoid duplicate RPC calls', async () => {
  const { service, state } = fixture();
  const [a,b] = await Promise.all([service.summary(token), service.summary(token)]);
  assert.deepEqual(a,b);
  assert.equal(a.totalInvestors,3); assert.equal(a.currentHolders,1);
  assert.equal(a.formerHolders,1); assert.equal(a.unknownHolders,1);
  assert.equal(a.balanceBlockNumber,123);
  await service.summary(token);
  assert.equal(state.reads,3); assert.equal(state.queries,1);
});
test('wrong chain or unavailable RPC never classifies balances as zero', async () => {
  for (const providerFactory of [() => ({ getNetwork: async () => ({ chainId: 2n }) }),
    () => ({ getNetwork: async () => { throw new Error('offline'); } })]) {
    const { service } = fixture({ providerFactory });
    const result = await service.summary(token);
    assert.equal(result.unknownHolders,3); assert.equal(result.formerHolders,0);
    assert.equal(result.balanceBlockNumber,null);
  }
});
test('changed block hash invalidates all checked balances', async () => {
  const { service } = fixture({ providerFactory: () => ({ getNetwork: async () => ({chainId:1}),
    getBlock: async tag => ({ number:123, hash:tag==='latest'?'before':'after' }) }) });
  assert.equal((await service.summary(token)).unknownHolders,3);
});
test('chain and token address are part of cache isolation', async () => {
  const { service, state } = fixture();
  await service.summary(token);
  await service.summary({ ...token, tokenAddress: `0x${'5'.repeat(40)}` });
  assert.equal(state.queries,2);
});
