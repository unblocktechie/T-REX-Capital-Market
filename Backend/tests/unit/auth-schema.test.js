const test = require('node:test');
const assert = require('node:assert/strict');
const { signup, resetPassword } = require('../../src/schemas/auth.schema');

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

test('reset token must be 64 hexadecimal characters', () => {
  const { error } = resetPassword.validate({ token: 'not-a-token', newPassword: 'Launch!234' });
  assert.ok(error);
});
