const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpaqueToken, hashToken, createUid } = require('../../src/utils/token');
const { parseSettingValue } = require('../../src/services/general-setting.service');
const { redact } = require('../../src/services/common/log.service');
const { resolveSignupRoleUid, requiresPrivyWalletIdentity } = require('../../src/services/auth.service');
const { env } = require('../../src/core/config/env');

test('opaque tokens are random and only their hash needs storage', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.match(hashToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken(first), first);
});

test('generated entity identifiers are UUIDs', () => assert.match(createUid(), /^[0-9a-f-]{36}$/i));

test('public setting values are converted by declared type', () => {
  assert.equal(parseSettingValue('25', 'number'), 25);
  assert.equal(parseSettingValue('true', 'boolean'), true);
  assert.deepEqual(parseSettingValue('{"enabled":true}', 'json'), { enabled: true });
});

test('logger redacts secrets recursively', () => {
  assert.deepEqual(redact({ email: 'a@example.com', nested: { password: 'secret' } }), {
    email: 'a@example.com', nested: { password: '[REDACTED]' },
  });
});

test('signup role selection maps issuer and investor deterministically', () => {
  assert.equal(resolveSignupRoleUid(true), env.auth.issuerRoleUid);
  assert.equal(resolveSignupRoleUid(false), env.auth.investorRoleUid);
});

test('Privy wallet identity is required only for issuer and investor roles', () => {
  assert.equal(requiresPrivyWalletIdentity({ roleName: 'Issuer' }), true);
  assert.equal(requiresPrivyWalletIdentity({ roleName: 'Investor' }), true);
  assert.equal(requiresPrivyWalletIdentity({ roleName: 'Admin' }), false);
});
