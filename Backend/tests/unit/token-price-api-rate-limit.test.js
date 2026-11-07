const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { positiveSetting } = require('../../src/utils/positive-setting');
const { TokenPriceApiRateLimitService } = require('../../src/services/token-price-api-rate-limit.service');
const { createIssuerPriceRateLimiter } = require('../../src/middleware/rate-limit.middleware');

test('missing and invalid DB settings fall back; positive integers are accepted', async () => {
  for (const raw of [undefined, null, '', 'no', '0', '-1', '1.5', Infinity, true]) {
    for (const [key, fallback] of [['IssuerApiKeyMaxActive', 5], ['TokenPriceApiReadRateLimitCount', 60], ['TokenPriceApiReadRateLimitWindowSeconds', 60]]) {
      assert.equal(await positiveSetting({ findByKey: async () => raw === undefined ? null : ({ settingValue: raw }) }, key, fallback), fallback);
    }
  }
  assert.equal(await positiveSetting({ findByKey: async () => ({ settingValue: '2' }) }, 'IssuerApiKeyMaxActive', 5), 2);
});

test('issuer budget shared across API keys, prepare/status/invalid submit; independent issuers and Retry-After', async () => {
  const used = new Map();
  const service = new TokenPriceApiRateLimitService({
    transactionRunner: (work) => work({}),
    ownerRepository: { lockOwner: async (uid, connection) => { connection.locked = uid; } },
    settingRepository: { findByKey: async (key) => ({ settingValue: key.endsWith('Count') ? '2' : '60' }) },
    repository: { consume: async (uid, count, window, connection) => {
      assert.equal(connection.locked, uid);
      assert.equal(window, 60);
      const n = used.get(uid) || 0;
      if (n >= count) return { allowed: false, retryAfter: 60 };
      used.set(uid, n + 1);
      return { allowed: true };
    } },
  });
  const app = express();
  app.use((req, res, next) => { req.user = { userUid: req.get('x-test-key').split(':')[0] }; next(); });
  app.use(createIssuerPriceRateLimiter(service));
  app.post('/prepare', (req, res) => res.sendStatus(200));
  app.get('/status', (req, res) => res.sendStatus(200));
  app.post('/submit', (req, res) => res.sendStatus(400));
  await request(app).post('/prepare').set('x-test-key', 'issuer1:key1').expect(200);
  await request(app).get('/status').set('x-test-key', 'issuer1:key2').expect(200);
  const denied = await request(app).post('/prepare').set('x-test-key', 'issuer1:key1').expect(429);
  assert.equal(denied.body.error.code, 'PRICE_API_RATE_LIMITED');
  assert.equal(denied.headers['retry-after'], '60');
  await request(app).post('/submit').set('x-test-key', 'issuer2:key3').expect(400);
  await request(app).post('/submit').set('x-test-key', 'issuer2:key3').expect(400);
  await request(app).post('/submit').set('x-test-key', 'issuer2:key4').expect(429);
});
