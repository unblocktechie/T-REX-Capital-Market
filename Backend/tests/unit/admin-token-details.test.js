const test = require('node:test');
const assert = require('node:assert/strict');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
const schema = require('../../src/schemas/admin-platform.schema');
test('token details return paginated investors and reject missing tokens', async () => {
  let token = { tokenUid: 't', chainUid: 'c' };
  const service = new AdminPlatformService({ repository: {
    tokenDetails: async () => token,
    tokenInvestors: async (t, q, scope) => { assert.equal(t.chainUid, 'c'); assert.equal(q.page, 2);
      assert.equal(scope.all, true); return [{ userUid: 'first' }, { userUid: 'u' }]; },
  }, holderBalanceService: { balances: async () => new Map() } });
  const result = await service.tokenDetails('t', { page: 2, limit: 1 });
  assert.equal(result.investors[0].userUid, 'u'); assert.equal(result.pagination.total, 2);
  assert.equal(result.investors[0].holderStatus, 'UNKNOWN');
  token = null; await assert.rejects(service.tokenDetails('missing', {}), e => e.statusCode === 404);
});
test('admin history uses shared timeline formatter with protected admin download URLs', async () => {
  let interest = { interestUid: 'i', legalCompanyName: 'Example Issuer' };
  const service = new AdminPlatformService({ getInvestmentService: () => ({
    repository: { findInterestByUid: async () => interest },
    assembleHistory: async (row, link) => { assert.equal(link('doc'), '/api/v1/admin/investor-applications/i/documents/doc/download'); return { ...row, timeline: [] }; },
  }) });
  assert.deepEqual(await service.applicationHistory('i'), {
    interestUid: 'i', legalCompanyName: 'Example Issuer', timeline: [], organizationName: 'Example Issuer',
  });
  interest = null; await assert.rejects(service.applicationHistory('missing'), e => e.statusCode === 404);
});
test('admin detail parameters and pagination are validated', () => {
  assert.ok(schema.tokenParams.validate({ tokenUid: 'bad' }).error);
  assert.ok(schema.interestParams.validate({ interestUid: 'bad' }).error);
  assert.ok(schema.detailQuery.validate({ limit: 101 }).error);
  assert.equal(schema.detailQuery.validate({}).value.limit, 20);
});
