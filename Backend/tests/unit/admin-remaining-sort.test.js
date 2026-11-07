const test = require('node:test');
const assert = require('node:assert/strict');
const { ChainRepository } = require('../../src/repositories/chain.repository');
const { PaymentTokenRepository } = require('../../src/repositories/payment-token.repository');
const { ChainAuditRepository } = require('../../src/repositories/chain-audit.repository');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
const schemas = require('../../src/schemas/admin-platform.schema');
const chainSchemas = require('../../src/schemas/chain.schema');

test('chain, payment token and audit SQL use sorting parameters with stable ordering', async () => {
  for (const [repository, field, expected] of [
    [new ChainRepository(), 'chainId', '`chainId` ASC,`chainUid` ASC'],
    [new PaymentTokenRepository(), 'name', 'p.paymentTokenName ASC,p.paymentTokenUid ASC'],
    [new ChainAuditRepository(), 'operation', 'a.operation ASC,a.chainAuditUid ASC'],
  ]) {
    const statements = [];
    const executor = { execute: async sql => { statements.push(sql); return [sql.includes('COUNT(*)') ? [{ total: 0 }] : []]; } };
    const options = { sortBy: field, sortOrder: 'asc' };
    if (repository instanceof ChainAuditRepository) await repository.list('chain', options, executor);
    else await repository.listAdmin(options, executor);
    assert.ok(statements.some(sql => sql.includes(`ORDER BY ${expected}`)));
  }
});
test('all new list schemas reject unexpected sort fields', () => {
  for (const schema of [schemas.investorQuery, schemas.investorChainQuery, schemas.historyQuery,
    schemas.detailQuery, chainSchemas.chainList, chainSchemas.chainAuditList, chainSchemas.paymentTokenList]) {
    assert.ok(schema.validate({ sortBy: 'x; DROP TABLE tokenMaster' }).error);
    assert.ok(schema.validate({ sortOrder: 'invalid' }).error);
  }
});
test('token investor balances sort numerically before slicing; unknown stays last', async () => {
  const service = new AdminPlatformService({ repository: { tokenDetails: async () => ({ tokenUid: 'token' }) } });
  service.tokenHolders = async () => ({ rows: [
    { userUid: 'a', currentTokenBalanceRaw: '2' }, { userUid: 'b', currentTokenBalanceRaw: '100000000000000000000' },
    { userUid: 'c', currentTokenBalanceRaw: null },
  ], holderSummary: { totalInvestors: 3 } });
  const result = await service.tokenDetails('token', { sortBy: 'currentTokenBalance', sortOrder: 'desc', page: 1, limit: 1 });
  assert.equal(result.investors[0].userUid, 'b');
  assert.equal(result.pagination.total, 3);
});
