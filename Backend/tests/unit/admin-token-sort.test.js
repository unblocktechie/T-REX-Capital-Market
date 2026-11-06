const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenListQuery } = require('../../src/schemas/admin-platform.schema');
const { AdminPlatformRepository } = require('../../src/repositories/admin-platform.repository');
test('token sorting validates and maps SQL columns before pagination, including numeric prices', async () => {
  const repository = new AdminPlatformRepository();
  let order;
  repository.page = async (fields, from, where, params, q, ordering) => { order = ordering; };
  for (const [sortBy, column] of [['tokenName', 't.tokenName'], ['currentTokenPrice', 't.currentTokenPrice'], ['chainId', 'c.chainId']]) {
    const parsed = tokenListQuery.validate({ sortBy, sortOrder: 'ASC' });
    assert.ifError(parsed.error);
    await repository.tokens(parsed.value);
    assert.equal(order, `${column} ASC,t.tokenUid ASC`);
  }
  await repository.tokens({});
  assert.equal(order, 't.createdAt DESC,t.tokenUid DESC');
  assert.ok(tokenListQuery.validate({ sortBy: 'tokenName; DROP TABLE tokenMaster' }).error);
  assert.ok(tokenListQuery.validate({ sortOrder: 'invalid' }).error);
  assert.ifError(tokenListQuery.validate({ sortBy: 'currentHolders' }).error);
});
