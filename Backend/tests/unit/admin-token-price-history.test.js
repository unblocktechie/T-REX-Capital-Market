const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
const { TokenPriceUpdateService } = require('../../src/services/token-price-update.service');
const { createAdminPlatformRouter } = require('../../src/api/v1/routes/admin-platform.routes');
const { ApiError } = require('../../src/core/errors/api-error');
const { errorHandler } = require('../../src/core/errors/error-handler');
const uid = '36008ef7-9952-4413-ab23-407c83ecb290';

test('admin history uses token-specific chain and shared formatting; missing token rejected', async () => {
  const token = { tokenUid: uid, chainUid: 'chain', organizationUid: 'org' };
  const options = { page: 1, limit: 100, source: 'manual', status: 'all', search: '12' };
  const priceService = Object.create(TokenPriceUpdateService.prototype);
  priceService.repository = { listHistory: async (...args) => {
    assert.deepEqual(args, [uid, 'org', 'chain', options]);
    return { rows: [{ isLegacyUpdate: 0, isOnchainUpdate: 1, oldPriceRaw: '1500000', priceDecimals: 6 }], pagination: { total: 1 } };
  } };
  const service = new AdminPlatformService({ repository: { tokenDetails: async id => id === uid ? token : null },
    getPriceUpdateService: () => priceService });
  const result = await service.tokenPriceHistory(uid, options);
  assert.equal(result.rows[0].oldPriceFormatted, '1.5');
  assert.equal(result.rows[0].isOnchainUpdate, true);
  await assert.rejects(service.tokenPriceHistory('missing', options), error => error.statusCode === 404);
});

test('admin price history authenticates, authorizes and validates filters without chain header', async () => {
  const app = express();
  let calls = 0;
  app.use('/api/v1/admin', createAdminPlatformRouter({
    authenticate: (req, res, next) => req.get('Authorization') ? next() : next(ApiError.unauthorized()),
    authorize: (req, res, next) => req.get('Authorization') === 'Bearer admin' ? next() : next(ApiError.forbidden()),
    service: { tokenPriceHistory: async (id, query) => {
      calls++; assert.equal(id, uid); assert.equal(query.limit, 100);
      return { rows: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
    } },
  }));
  app.use(errorHandler);
  const url = `/api/v1/admin/tokens/${uid}/price-history`;
  await request(app).get(url).expect(401);
  for (const role of ['issuer', 'investor']) await request(app).get(url).set('Authorization', `Bearer ${role}`).expect(403);
  const response = await request(app).get(url + '?limit=100&source=all&status=all&search=').set('Authorization', 'Bearer admin').expect(200);
  assert.deepEqual(response.body.data, []);
  assert.equal(response.body.meta.pagination.total, 0);
  for (const query of ['limit=101', 'source=bad', 'status=bad', `tokenUid=${uid}`]) {
    await request(app).get(url + '?' + query).set('Authorization', 'Bearer admin').expect(422);
  }
  assert.equal(calls, 1);
});
