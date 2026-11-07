const test = require('node:test');
const assert = require('node:assert/strict');
const { AdminPlatformRepository } = require('../../src/repositories/admin-platform.repository');
const { applicationQuery } = require('../../src/schemas/admin-platform.schema');

test('application sorting validates fields and uses mapped SQL with a stable tie breaker', async () => {
  const repository = new AdminPlatformRepository();
  let order;
  repository.page = async (fields, from, where, params, options, ordering) => { order = ordering; };
  await repository.applications({});
  assert.equal(order, 'a.createdAt DESC,a.interestUid DESC');
  for (const sortBy of ['walletAddress', 'tokenAddress', 'investorName', 'status']) {
    const parsed = applicationQuery.validate({ sortBy, sortOrder: 'ASC' });
    assert.ifError(parsed.error);
    await repository.applications(parsed.value);
    assert.match(order, / ASC,a.interestUid ASC$/);
  }
  assert.ok(applicationQuery.validate({ sortBy: 'createdAt; DROP TABLE x' }).error);
  assert.ok(applicationQuery.validate({ sortOrder: 'invalid' }).error);
  await repository.applications({ sortBy: 'invalid', sortOrder: 'invalid' });
  assert.equal(order, 'a.createdAt DESC,a.interestUid DESC');
});

test('application addresses are returned and searched by full value; text search remains partial', async () => {
  const repository = new AdminPlatformRepository();
  repository.page = async (fields, from, where, params, options) => {
    assert.match(fields, /a\.walletAddress,t\.tokenAddress/);
    const search = where.at(-1);
    assert.match(search, /LOWER\(a\.walletAddress\)=LOWER\(\?\)/);
    assert.match(search, /LOWER\(t\.tokenAddress\)=LOWER\(\?\)/);
    assert.doesNotMatch(search, /(?:walletAddress|tokenAddress) LIKE/);
    assert.deepEqual(params.slice(-6), [
      ...Array(4).fill(`%${options.search}%`), options.search, options.search,
    ]);
    return { rows: [], pagination: { total: 0 } };
  };
  for (const search of ['0x123', '0x1234567890123456789012345678901234567890', 'Alice']) {
    await repository.applications({ search, page: 1, limit: 20 });
  }
});
