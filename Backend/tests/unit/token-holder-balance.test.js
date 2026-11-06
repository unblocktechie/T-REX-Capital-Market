const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenHolderBalanceService } = require('../../src/services/blockchain/token-holder-balance.service');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
const { detailQuery } = require('../../src/schemas/admin-platform.schema');
const token = { tokenUid: 'token', tokenAddress: '0x1111111111111111111111111111111111111111', chainUid: 'chain', chainId: 421614 };
const wallets = ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444'];
const rows = wallets.map((walletAddress, i) => ({ userUid: String(i), walletAddress }));
function fixture(overrides = {}) {
  let reads = 0; let destroyed = 0;
  const service = new TokenHolderBalanceService({
    chainRepository: { findRawByUid: async uid => { assert.equal(uid, 'chain'); return { chainId: 421614, rpcUrl: 'primary', fallbackRpcUrls: ['fallback'] }; } },
    providerFactory: url => ({
      getNetwork: async () => ({ chainId: 421614n }),
      getBlock: async () => ({ number: 42, hash: 'canonical' }),
      destroy: () => { destroyed++; },
      url,
    }),
    contractFactory: (address, provider) => ({
      decimals: async ({ blockTag }) => { assert.equal(blockTag, 42); return 18n; },
      balanceOf: async (wallet, { blockTag }) => {
        assert.equal(address, token.tokenAddress); assert.equal(blockTag, 42); reads++;
        if (wallet === wallets[2]) throw new Error('contract error');
        return wallet === wallets[0] ? 123456789012345678901234567890n : 0n;
      },
    }),
    ...overrides,
  });
  return { service, reads: () => reads, destroyed: () => destroyed };
}
test('pinned-block balances preserve precision, and errors are unknown not former', async () => {
  const f = fixture();
  const balances = await f.service.balances(token, rows);
  assert.equal(balances.get(wallets[0]).currentTokenBalance, '123456789012.34567890123456789');
  assert.equal(balances.get(wallets[0]).holderStatus, 'CURRENT');
  assert.equal(balances.get(wallets[1]).holderStatus, 'FORMER');
  assert.equal(balances.get(wallets[1]).isCurrentHolder, false);
  assert.equal(balances.get(wallets[2]).holderStatus, 'UNKNOWN');
  assert.equal(balances.get(wallets[2]).currentTokenBalance, null);
  assert.equal(balances.get(wallets[0]).balanceBlockNumber, 42);
  assert.ok(balances.get(wallets[0]).balanceVerifiedAt);
  assert.equal(f.destroyed(), 1);
});
test('cache, single flight and unique wallets reduce repeat RPC calls; cache expires', async () => {
  let now = Date.now();
  const f = fixture({ now: () => now });
  await Promise.all([f.service.balances(token, [...rows, rows[0]]), f.service.balances(token, rows)]);
  assert.equal(f.reads(), 3);
  await f.service.balances(token, rows); assert.equal(f.reads(), 3);
  now += 30001;
  await f.service.balances(token, rows); assert.equal(f.reads(), 6);
  await f.service.balances({ ...token, tokenAddress: wallets[2] }, []); assert.equal(f.reads(), 6);
});
test('wrong-chain RPC falls back and a changed canonical block never verifies balances', async () => {
  let calls = 0;
  const f = fixture({ providerFactory: url => ({
    getNetwork: async () => ({ chainId: url === 'primary' ? 1 : 421614 }),
    getBlock: async () => ({ number: 42, hash: ++calls === 1 ? 'canonical' : 'reorg' }),
    destroy() {},
  }) });
  const values = await f.service.balances(token, rows);
  assert.ok([...values.values()].every(row => row.holderStatus === 'UNKNOWN'));
  assert.equal(f.reads(), 3);
});
test('unavailable RPCs and undeployed token return unknown without throwing', async () => {
  const f = fixture({ providerFactory: () => ({ getNetwork: async () => { throw new Error('rate limited'); }, destroy() {} }) });
  assert.ok([...(await f.service.balances(token, rows)).values()].every(row => row.holderStatus === 'UNKNOWN'));
  assert.ok([...(await f.service.balances({ ...token, tokenAddress: null }, rows)).values()].every(row => row.holderStatus === 'UNKNOWN'));
});
test('holder filtering precedes pagination; summary covers searched historical investors', async () => {
  const f = fixture();
  const service = new AdminPlatformService({ repository: {
    tokenDetails: async () => token,
    tokenInvestors: async (t, options, scope) => {
      assert.equal(scope.all, true); assert.equal(options.search, 'alice'); return rows;
    },
  }, holderBalanceService: f.service });
  const result = await service.tokenDetails('token', { page: 1, limit: 1, search: 'alice', holderStatus: 'former' });
  assert.equal(result.investors[0].userUid, '1');
  assert.equal(result.pagination.total, 1);
  assert.deepEqual(result.holderSummary, { totalInvestors: 3, currentHolders: 1, formerHolders: 1, unknownHolders: 1 });
  const all = await service.tokenDetails('token', { page: 3, limit: 1, search: 'alice', holderStatus: 'all' });
  assert.equal(all.investors[0].holderStatus, 'UNKNOWN');
  assert.equal(all.pagination.total, 3);
  assert.ok(detailQuery.validate({ holderStatus: 'invalid' }).error);
});
