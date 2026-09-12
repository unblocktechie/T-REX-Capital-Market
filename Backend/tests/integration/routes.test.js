const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../src/app');

const app = createApp();

test('GET /api/health returns the standard health response', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'UP');
  assert.equal(response.body.data.environment, 'development');
  assert.match(response.body.data.utcTimestamp, /Z$/);
  assert.ok(response.headers['x-request-id']);
});

test('unknown routes use the standardized not-found envelope', async () => {
  const response = await request(app).get('/does-not-exist').expect(404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('invalid signup is rejected before database access', async () => {
  const response = await request(app)
    .post('/api/v1/auth/signup')
    .send({ fullName: 'A', email: 'not-an-email', password: 'weak', isIssuer: true })
    .expect(422);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.ok(response.body.error.details.length >= 3);
});

test('protected routes require a Bearer token', async () => {
  const response = await request(app).get('/api/v1/roles').expect(401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('Privy signup completion validates the email and identity token before service access', async () => {
  const response = await request(app)
    .post('/api/v1/auth/privy/complete-signup')
    .send({ email: 'ada@example.com', identityToken: 'short' })
    .expect(422);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  await request(app).post('/api/v1/auth/verify-email').send({ token: 'invalid' }).expect(404);
});

test('token creation routes require a Bearer token', async () => {
  const response = await request(app).get('/api/v1/tokens/me').expect(401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('current token price route requires issuer authentication', async () => {
  const response = await request(app)
    .patch('/api/v1/tokens/me/price')
    .send({ currentTokenPrice: 1.25 })
    .expect(401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('configured CORS policy rejects unknown browser origins', async () => {
  const response = await request(app).get('/api/health').set('Origin', 'https://untrusted.example').expect(403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});
