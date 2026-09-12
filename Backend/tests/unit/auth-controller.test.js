const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthController } = require('../../src/api/v1/controllers/auth.controller');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('signup reports that the account was saved before Privy verification', async () => {
  const controller = createAuthController({ signup: async () => ({ userUid: 'user-1' }) });
  const res = response();
  await controller.signup({ id: 'request-1', body: { email: 'ada@example.com' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.match(res.body.message, /Privy email OTP/i);
  assert.equal(res.body.data.userUid, 'user-1');
});

test('complete Privy signup returns the application session', async () => {
  const controller = createAuthController({
    completeSignup: async () => ({ accessToken: 'app-jwt', user: { privyWalletAddress: '0x1111111111111111111111111111111111111111' } }),
  });
  const res = response();
  await controller.completePrivySignup({
    id: 'request-1',
    body: { email: 'ada@example.com', identityToken: 'identity-token' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.accessToken, 'app-jwt');
  assert.match(res.body.message, /wallet linked/i);
});

test('password phase of issuer login reports that Privy verification is required', async () => {
  const controller = createAuthController({
    login: async () => ({ privyVerificationRequired: true, email: 'ada@example.com' }),
  });
  const res = response();
  await controller.login({ id: 'request-1', body: { email: 'ada@example.com', password: 'Launch!234' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.privyVerificationRequired, true);
  assert.match(res.body.message, /Privy email verification/i);
});
