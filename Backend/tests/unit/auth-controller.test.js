const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthController } = require('../../src/api/v1/controllers/auth.controller');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('resend verification returns an explicit already-verified success response', async () => {
  const controller = createAuthController({
    resendVerification: async () => ({ status: 'ALREADY_VERIFIED', emailVerified: true }),
  });
  const res = response();
  await controller.resendVerification({ id: 'request-1', body: { email: 'verified@example.com' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'User is already verified. You can log in.');
  assert.deepEqual(res.body.data, { status: 'ALREADY_VERIFIED', emailVerified: true });
});

test('resend verification preserves the generic message for other request states', async () => {
  const controller = createAuthController({
    resendVerification: async () => ({ status: 'REQUEST_ACCEPTED' }),
  });
  const res = response();
  await controller.resendVerification({ id: 'request-1', body: { email: 'unknown@example.com' } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /If the account is eligible/);
  assert.equal(res.body.data, null);
});
