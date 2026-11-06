const test = require('node:test');
const assert = require('node:assert/strict');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
test('holder count sorting operates over all tokens before slicing pages', async () => {
  const service = new AdminPlatformService({ repository: { tokens: async (q, investor, mode) => {
    assert.equal(mode.all, true);
    return [{ tokenUid: 'a', count: 5 }, { tokenUid: 'b', count: 1 }, { tokenUid: 'c', count: 3 }];
  } } });
  service.tokenHolders = async token => ({ holderSummary: { currentHolders: token.count } });
  const asc = await service.list('tokens', { sortBy: 'currentHolders', sortOrder: 'asc', page: 2, limit: 1 });
  assert.equal(asc.rows[0].tokenUid, 'c');
  assert.equal(asc.pagination.total, 3);
  const desc = await service.list('tokens', { sortBy: 'currentHolders', sortOrder: 'desc', page: 1, limit: 1 });
  assert.equal(desc.rows[0].tokenUid, 'a');
});

test('token list includes independent summaries without applying token search to investors', async () => {
  const tokens = [{ tokenUid: 'a' }, { tokenUid: 'b' }];
  const pagination = { page: 1, limit: 20, total: 2, totalPages: 1 };
  const service = new AdminPlatformService({ repository: {
    tokens: async q => { assert.equal(q.search, 'Token'); return { rows: tokens, pagination }; },
    tokenInvestors: async (token, options, mode) => {
      assert.deepEqual(options, {}); assert.equal(mode.all, true);
      return token.tokenUid === 'a' ? [{ walletAddress: 'one' }, { walletAddress: 'two' }, { walletAddress: 'three' }] : [];
    },
  }, holderBalanceService: { balances: async () => new Map([
    ['one', { holderStatus: 'CURRENT' }], ['two', { holderStatus: 'FORMER' }],
  ]) } });
  const result = await service.list('tokens', { search: 'Token' });
  assert.equal(result.pagination, pagination);
  assert.deepEqual(result.rows[0].holderSummary, { totalInvestors: 3, currentHolders: 1, formerHolders: 1, unknownHolders: 1 });
  assert.deepEqual(result.rows[1].holderSummary, { totalInvestors: 0, currentHolders: 0, formerHolders: 0, unknownHolders: 0 });
});
