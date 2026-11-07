import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  hasConfiguredAllowlist, isKeyActive, normalizePolicy, normalizePolicyOptions,
  serializePolicy, validateAllowedIps, validatePolicy, visibleAllowedDays, WEEKDAYS,
} from '../src/utils/botPolicy.js';

const api = await readFile(new URL('../src/api/organization/organization.api.js', import.meta.url), 'utf8');
const endpoints = await readFile(new URL('../src/api/organization/organization.endpoints.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const keyCard = await readFile(new URL('../src/components/issuer/IssuerApiKeysCard.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

test('policy options and edits use issuer JWT routes without selected-chain header', () => {
  assert.match(endpoints, /apiKeyPolicyOptions: '\/organizations\/me\/api-key-policy-options'/);
  assert.match(endpoints, /encodeURIComponent\(issuerApiKeyUid\)\}\/policy/);
  assert.match(api, /getApiKeyPolicyOptions:[\s\S]*?skipSelectedChainHeader: true/);
  assert.match(api, /updateApiKeyPolicy:[\s\S]*?\.put\(ORGANIZATION_ENDPOINTS\.apiKeyPolicy\(issuerApiKeyUid\), payload/);
});

test('required readiness needs an active key with a saved IP allowlist', () => {
  const valid = { status: 'ACTIVE', policy: { allowedIps: ['8.8.8.8'] }, expiresAt: '2099-10-22T00:00:00Z' };
  assert.equal(hasConfiguredAllowlist(valid), true);
  assert.equal(hasConfiguredAllowlist({ ...valid, policy: null }), false);
  assert.equal(hasConfiguredAllowlist({ ...valid, policy: { allowedIps: [] } }), false);
  assert.equal(hasConfiguredAllowlist({ ...valid, expiresAt: '2000-01-01T00:00:00Z' }), false);
  assert.equal(isKeyActive({ ...valid, status: 'REVOKED' }), false);
  assert.match(page, /const apiReady = loaded && savedEligibleKeys\.length > 0/);
  assert.match(page, /const ready = apiReady && walletStatus\.ready/);
  assert.match(page, /Bot setup complete/);
});

test('create requires allowed IPs, edit submits complete policy and retains key secret', () => {
  assert.match(keyCard, /allowedIps: splitIps\(allowedIps\)/);
  assert.match(keyCard, /Configure an IP allowlist before replacing a legacy key/);
  assert.match(editor, /updateApiKeyPolicy\(selected\.uid, serializePolicy\(section === 'schedule'/);
  assert.doesNotMatch(editor, /rotateApiKey|createApiKey/);
  assert.deepEqual(serializePolicy(normalizePolicy({ allowedIps: ['8.8.8.8'], threshold: '24.75' })).allowedIps, ['8.8.8.8']);
  assert.equal(serializePolicy(normalizePolicy({ allowedIps: ['8.8.8.8'] })).frequency, null);
});

test('public and private IPs pass; malformed addresses and invalid policy values fail', () => {
  assert.equal(validateAllowedIps('8.8.8.8'), '');
  assert.equal(validateAllowedIps('2001:4860:4860::8888'), '');
  assert.equal(validateAllowedIps('192.168.29.23'), '');
  assert.equal(validateAllowedIps('10.0.0.1'), '');
  assert.equal(validateAllowedIps('172.16.1.2'), '');
  assert.equal(validateAllowedIps('127.0.0.1'), '');
  assert.equal(validateAllowedIps('fd00::1234'), '');
  assert.equal(validateAllowedIps('fe80::1'), '');
  assert.equal(validateAllowedIps('::1'), '');
  assert.equal(validateAllowedIps('::ffff:192.168.29.23'), '');
  assert.equal(validateAllowedIps('2001:db8::1234'), '');
  assert.match(validateAllowedIps('8.8.8.8\n8.8.8.8'), /duplicate/);
  assert.match(validateAllowedIps('8.8.8.8/32'), /CIDR/);
  assert.match(validateAllowedIps('192.168.1.0/24'), /CIDR/);
  assert.match(validateAllowedIps('256.1.1.1'), /valid IPv4/);
  assert.match(validateAllowedIps('192.168.1'), /valid IPv4/);
  assert.match(validateAllowedIps('2001:::1'), /valid IPv4/);
  assert.match(validateAllowedIps('1:2:3:4:5:6:7:8:9'), /valid IPv4/);
  assert.match(validateAllowedIps('not-an-ip'), /valid IPv4/);
  const base = { allowedIps: '192.168.29.23' };
  assert.equal(hasConfiguredAllowlist({ status: 'ACTIVE', policy: { allowedIps: ['192.168.29.23'] } }), true);
  assert.equal(validatePolicy({ ...base, threshold: '24.75' }), '');
  assert.match(validatePolicy({ ...base, threshold: '100.01' }), /100%/);
  assert.match(validatePolicy({ ...base, threshold: '0' }), /100%/);
  assert.equal(validatePolicy({ ...base, startTime: '22:00', endTime: '06:00' }), '');
  assert.equal(validatePolicy({ ...base, startTime: '18:00', endTime: '09:00' }), '');
  assert.match(validatePolicy({ ...base, startTime: '09:00', endTime: '09:00' }), /different/);
  assert.equal(validatePolicy({ ...base, startTime: '09:00', endTime: '18:00' }), '');
  assert.match(validatePolicy({ ...base, startTime: '09:00' }), /both a start/);
  assert.match(validatePolicy({ ...base, timezone: 'Not/AZone' }), /IANA timezone/);
  assert.match(validatePolicy({ ...base, cooldownSeconds: '29' }), /Cooldown/);
  assert.equal(validatePolicy({ ...base, cooldownSeconds: '30', allowedDays: ['Mon', 'Fri'] }), '');
});

test('configured bounds are drawn from the API, with documented defaults for missing optional fields', () => {
  assert.deepEqual(normalizePolicyOptions({ cooldownMinSeconds: 60, cooldownMaxSeconds: 900, allowedIpsMin: 2, allowedIpsMax: 5 }), { cooldownMin: 60, cooldownMax: 900, ipMin: 2, ipMax: 5, valid: true });
  assert.equal(normalizePolicyOptions({ allowedIpsMin: 5, allowedIpsMax: 2 }).valid, false);
});

test('four responsive tabs have operational controls rather than simulated save actions', () => {
  assert.match(page, /'api-keys'[\s\S]*?'network'[\s\S]*?'protection'[\s\S]*?'schedule'/);
  assert.match(editor, /<form onSubmit=\{save\}/);
  assert.match(editor, /name="bot-update-frequency" value=\{choice.value\}/);
  assert.match(editor, /<BotIpAllowlistInput/);
  assert.match(styles, /@media \(max-width: 760px\)[^\n]*bot-config__tabs/);
});


test('redesigned controls preserve the backend policy payload and actual choices', async () => {
  const picker = await readFile(new URL('../src/components/issuer/BotKeyPicker.jsx', import.meta.url), 'utf8');
  assert.match(picker, /Search API keys/);
  assert.match(picker, /onSelectedUidChange|onChange\(key.uid\)/);
  for (const rule of ["value: 'hourly'", "value: 'daily'", "value: 'weekly'", "value: 'monthly'"]) {
    assert.ok(editor.includes(rule), `Missing frequency ${rule}`);
  }
  assert.match(editor, /onChange=\{\(\) => onChange\(choice.value\)\}/);
  assert.match(editor, /value=\{draft.allowedIps\}/);
  assert.match(editor, /validatePolicy\(draft, bounds\)/);
  assert.match(editor, /serializePolicy\(section === 'schedule'/);
  assert.match(editor, /draft.allowedDays/);
  assert.match(editor, /draft.startTime/);
  assert.match(editor, /draft.endTime/);
  assert.match(editor, /draft.timezone/);
  assert.deepEqual(visibleAllowedDays([]), WEEKDAYS);
  assert.deepEqual(visibleAllowedDays(null), WEEKDAYS);
  assert.deepEqual(visibleAllowedDays(['Mon', 'Fri']), ['Mon', 'Fri']);
});

test('unsaved changes and responsive, accessible controls are visible in the UI', () => {
  assert.match(page, /Discard unsaved changes/);
  assert.match(editor, /Discard and switch/);
  assert.match(editor, /aria-pressed/);
  assert.match(editor, /type="radio"/);
  assert.match(editor, /onDirtyChange/);
  assert.match(editor, /reset|Reset/);
  assert.match(styles, /bot-config__frequency-choices/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});
