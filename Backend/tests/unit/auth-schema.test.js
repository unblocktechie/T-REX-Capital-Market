const test = require('node:test');
const assert = require('node:assert/strict');
const { signup, login, completePrivySignup, resetPassword } = require('../../src/schemas/auth.schema');

const identityToken = 'x'.repeat(128);

test('signup trims names and normalizes email', () => {
  const { error, value } = signup.validate({
    fullName: '  Ada Lovelace  ', email: '  ADA@Example.COM ', password: 'Launch!234', isIssuer: true,
  });
  assert.equal(error, undefined);
  assert.equal(value.fullName, 'Ada Lovelace');
  assert.equal(value.email, 'ada@example.com');
  assert.equal(value.isIssuer, true);
});

test('password policy rejects weak credentials', () => {
  const { error } = signup.validate({ fullName: 'Ada Lovelace', email: 'ada@example.com', password: 'password', isIssuer: false });
  assert.ok(error);
});

test('signup requires an explicit issuer or investor selection', () => {
  const { error } = signup.validate({ fullName: 'Ada Lovelace', email: 'ada@example.com', password: 'Launch!234' });
  assert.ok(error);
  assert.match(error.message, /isIssuer/);
});

test('login accepts the password-only phase and the follow-up Privy identity-token phase', () => {
  const first = login.validate({ email: 'ada@example.com', password: 'Launch!234' });
  const second = login.validate({ email: 'ada@example.com', password: 'Launch!234', identityToken });
  assert.equal(first.error, undefined);
  assert.equal(second.error, undefined);
});

test('Privy signup completion requires the account email and identity token', () => {
  assert.equal(completePrivySignup.validate({ email: 'ada@example.com', identityToken }).error, undefined);
  assert.ok(completePrivySignup.validate({ email: 'ada@example.com', identityToken: 'short' }).error);
  assert.ok(completePrivySignup.validate({ identityToken }).error);
});

test('reset token must be 64 hexadecimal characters', () => {
  const { error } = resetPassword.validate({ token: 'not-a-token', newPassword: 'Launch!234' });
  assert.ok(error);
});
