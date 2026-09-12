const test = require('node:test');
const assert = require('node:assert/strict');

const connectionPath = require.resolve('../../src/database/connection');
const repositoryPath = require.resolve('../../src/repositories/token-purchase.repository');
const originalConnectionModule = require.cache[connectionPath];
const calls = [];

require.cache[connectionPath] = {
  id: connectionPath,
  filename: connectionPath,
  loaded: true,
  exports: {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return /^SELECT COUNT\(\*\)/.test(sql)
        ? [{ total: 1 }]
        : [{ tokenUid: 'token-1' }];
    },
  },
};
delete require.cache[repositoryPath];

const { TokenPurchaseRepository } = require('../../src/repositories/token-purchase.repository');

test.after(() => {
  delete require.cache[repositoryPath];
  if (originalConnectionModule) require.cache[connectionPath] = originalConnectionModule;
  else delete require.cache[connectionPath];
});

test('portfolio aggregates the canonical transaction ledger without legacy transaction tables', async () => {
  calls.length = 0;
  const repository = new TokenPurchaseRepository();
  const result = await repository.listPortfolio('user-1', {
    page: 2,
    limit: 10,
    search: 'Acme',
  });

  assert.equal(result.total, 1);
  assert.deepEqual(result.rows, [{ tokenUid: 'token-1' }]);
  assert.equal(calls.length, 2);

  for (const call of calls) {
    assert.match(call.sql, /FROM `blockchainTransaction` bt/);
    assert.doesNotMatch(call.sql, /HAVING/);
    assert.match(call.sql, /bt\.`status` = 'CONFIRMED'/);
    assert.match(call.sql, /bt\.`isCanonical` = 1/);
    assert.doesNotMatch(call.sql, /FROM `tokenPurchase`/);
    assert.doesNotMatch(call.sql, /FROM `tokenRedemption`/);
    assert.doesNotMatch(call.sql, /FROM `tokenTransfer`/);
    assert.deepEqual(call.params, [
      'user-1',
      'user-1',
      '%acme%',
      '%acme%',
      '%acme%',
      '%acme%',
    ]);
  }

  assert.match(calls[0].sql, /LIMIT 10 OFFSET 10/);
});
