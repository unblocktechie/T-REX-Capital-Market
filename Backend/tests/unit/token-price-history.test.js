const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenService } = require('../../src/services/token.service');
const { TokenPriceUpdateService } = require('../../src/services/token-price-update.service');
const { TokenPriceUpdateRepository } = require('../../src/repositories/token-price-update.repository');
const { tokenPriceHistoryQuery } = require('../../src/schemas/token.schema');

test('history query supports bounded pagination, search and source/status filters', () => {
  assert.equal(tokenPriceHistoryQuery.validate({ source: 'legacy', status: 'APPLIED', search: '' }).error, undefined);
  assert.equal(tokenPriceHistoryQuery.validate({ source: 'manual' }).error, undefined);
  assert.equal(tokenPriceHistoryQuery.validate({ source: 'automated' }).error, undefined);
  assert.equal(tokenPriceHistoryQuery.validate({ status: 'CANCELLED' }).error, undefined);
  assert.ok(tokenPriceHistoryQuery.validate({ limit: 101 }).error);
  assert.ok(tokenPriceHistoryQuery.validate({ source: 'invalid' }).error);
});

test('history query scopes every SQL query and never selects signatures', async () => {
  const queries = [];
  const executor = { execute: async (sql, params) => { queries.push({ sql, params }); return [sql.includes('COUNT(*)') ? [{ total: 0 }] : []]; } };
  await new TokenPriceUpdateRepository().listHistory('token1', 'org1', 'chain1', { page: 2, limit: 5, source: 'legacy', status: 'APPLIED', search: '1.5' }, executor);
  for (const query of queries) {
    assert.match(query.sql, /tokenUid=\? AND organizationUid=\? AND chainUid=\?/);
    assert.deepEqual(query.params.slice(0, 3), ['token1', 'org1', 'chain1']);
    assert.match(query.sql, /submissionMode='LEGACY'/);
    assert.doesNotMatch(query.sql, /signatureR|signatureS|SELECT \*/);
  }
  assert.match(queries[1].sql, /LIMIT 5 OFFSET 5/);
  assert.match(queries[1].sql, /WHEN submissionMode='RELAYED' THEN serviceWalletAddress/);
  assert.match(queries[1].sql, /WHEN submissionMode IN \('DIRECT','LEGACY'\) THEN issuerWalletAddress/);
  assert.match(queries[1].sql, /ELSE NULL END AS updatedByWalletAddress/);
  assert.match(queries[1].sql, /updateType AS submissionMode,updateType/);
});

test('price PATCH uses locked old price and rolls back if history cannot be saved', async () => {
  let price = '1';
  let rolledBack = false;
  const token = { tokenUid: 't', organizationUid: 'o', status: 'deployed', isActive: true };
  const service = new TokenService({
    repository: { findByUserUid: async () => token,
      lockPriceByOwner: async () => ({ ...token, previousPrice: '1' }),
      updateCurrentPriceByOwner: async (u, t, value) => { price = value; return { ...token, currentTokenPrice: value }; } },
    organizationRepository: { findByUserUid: async () => ({ organizationUid: 'o', status: 'approved', walletAddress: `0x${'1'.repeat(40)}` }) },
    priceUpdateRepository: { createLegacy: async (data) => { assert.equal(data.oldPrice, '1'); throw new Error('history failed'); } },
    transactionRunner: async (work) => { const old = price; try { return await work({}); } catch (e) { price = old; rolledBack = true; throw e; } },
  });
  await assert.rejects(service.updateCurrentPrice({ userUid: 'u', roleName: 'Issuer' }, { currentTokenPrice: 2 }), /history failed/);
  assert.equal(price, '1');
  assert.equal(rolledBack, true);
});

test('history lists legacy and on-chain prices with consistent flags and ownership scope', async () => {
  const service = new TokenPriceUpdateService({
    organizationRepository: { findByUserUid: async () => ({ organizationUid: 'o', status: 'approved' }) },
    tokenRepository: { findByUserUid: async () => ({ tokenUid: 't', chainUid: 'c', tokenAddress: `0x${'1'.repeat(40)}`, status: 'deployed' }) },
    repository: { listHistory: async (token, organization, chain) => {
      assert.deepEqual([token, organization, chain], ['t', 'o', 'c']);
      return { rows: [{ isLegacyUpdate: 1, isOnchainUpdate: 0, oldPriceFormatted: '2.5' },
        { isLegacyUpdate: 0, isOnchainUpdate: 1, oldPriceRaw: '1500000', priceDecimals: 6 }], pagination: { total: 2 } };
    } },
  });
  const chain = { chainUid: 'c', platformControllerAddress: `0x${'2'.repeat(40)}` };
  const result = await service.history({ roleName: 'Issuer' }, {}, chain);
  assert.equal(result.rows[0].isLegacyUpdate, true);
  assert.equal(result.rows[1].oldPriceFormatted, '1.5');
  await assert.rejects(service.history({ roleName: 'Investor' }, {}, chain), (e) => e.statusCode === 400);
  await assert.rejects(service.history({ roleName: 'Issuer' }, { tokenUid: 'another' }, chain), (e) => e.statusCode === 403);
  await assert.rejects(service.history({ roleName: 'Issuer' }, {}, { ...chain, chainUid: 'other' }), (e) => e.code === 'SELECTED_CHAIN_MISMATCH');
});

test('investors can read deployed token history only on the selected chain', async () => {
  let token = { tokenUid: 't', organizationUid: 'o', chainUid: 'c', status: 'deployed' };
  let historyCalls = 0;
  const service = new TokenPriceUpdateService({
    investmentRepository: { findMarketplaceTokenByUid: async (uid, chain) => {
      assert.equal(uid, 't'); assert.equal(chain, 'c'); return token;
    } },
    repository: { listHistory: async (uid, org, chain, options) => {
      historyCalls += 1;
      assert.deepEqual([uid, org, chain], ['t', 'o', 'c']);
      assert.equal(options.source, 'blockchain');
      return { rows: [], pagination: { total: 0 } };
    } },
  });
  const user = { roleName: 'Investor' };
  const options = { tokenUid: 't', source: 'blockchain' };
  const chain = { chainUid: 'c' };
  assert.equal((await service.history(user, options, chain)).pagination.total, 0);
  for (const invalid of [null, { ...token, status: 'draft' }, { ...token, chainUid: 'other' }]) {
    const saved = token; token = invalid;
    await assert.rejects(service.history(user, options, chain), (e) => e.statusCode === 404);
    token = saved;
  }
  await assert.rejects(service.history(user, options, null), (e) => e.code === 'SELECTED_CHAIN_REQUIRED');
  await assert.rejects(service.history({ roleName: 'Admin' }, options, chain), (e) => e.statusCode === 403);
  assert.equal(historyCalls, 1);
  assert.ok(tokenPriceHistoryQuery.validate({ tokenUid: 'invalid' }).error);
});
