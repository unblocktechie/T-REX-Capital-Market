import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getUnsavedPolicySections, normalizePolicy, serializePolicy, validatePolicy } from '../src/utils/botPolicy.js';

const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const input = await readFile(new URL('../src/components/issuer/BotIpAllowlistInput.jsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/api/organization/organization.api.js', import.meta.url), 'utf8');
const endpoints = await readFile(new URL('../src/api/organization/organization.endpoints.js', import.meta.url), 'utf8');

const server = {
  allowedIps: ['49.36.89.50'], threshold: '10', maxCumulative24hPercent: '20',
  cooldownSeconds: '300', frequency: 'daily', allowedDays: ['Mon', 'Wed'],
  startTime: '12:00', endTime: '16:00', timezone: 'UTC',
};
const isDirty = (draft, saved, pending = '') => Object.values(getUnsavedPolicySections(draft, saved, pending)).some(Boolean);

test('Add followed by clearing pending text keeps Save enabled for an unsaved address', () => {
  const original = normalizePolicy(server);
  const afterAdd = { ...original, allowedIps: `${original.allowedIps}\n192.168.29.142` };
  assert.equal(isDirty(original, server), false);
  assert.equal(isDirty(original, server, '192.168.29.142'), true);
  assert.equal(isDirty(afterAdd, server, ''), true);
  assert.equal(validatePolicy(afterAdd), '');
  assert.deepEqual(serializePolicy(afterAdd).allowedIps, ['49.36.89.50', '192.168.29.142']);
  assert.deepEqual(serializePolicy(afterAdd).allowedDays, ['Mon', 'Wed']);
  assert.equal(serializePolicy(afterAdd).threshold, '10');
});

test('Remove and restore updates Save eligibility without stale dirty flags', () => {
  const original = normalizePolicy(server);
  const removed = { ...original, allowedIps: '49.36.89.50\n192.168.29.142' };
  assert.equal(isDirty(removed, server), true);
  assert.equal(isDirty(original, server), false);
  assert.equal(isDirty({ ...original, allowedIps: '' }, server), true);
  assert.match(validatePolicy({ ...original, allowedIps: '' }), /IP/);
});

test('editor derives dirty from latest draft, including when input clears after Add', () => {
  assert.match(editor, /const unsavedSections = useMemo\([\s\S]*?getUnsavedPolicySections\(draft, saved, pendingIp\)/);
  assert.match(editor, /const dirty = Object\.values\(unsavedSections\)\.some\(Boolean\)/);
  assert.doesNotMatch(editor, /setDirty\(/);
  assert.match(editor, /onPendingChange=\{setPendingIp\}/);
  assert.match(input, /onChange\(\[\.\.\.addresses, next\]\.join\('\\n'\)\)/);
  assert.match(input, /updatePending\(''\)/);
  assert.match(editor, /disabled=\{!selected\?\.uid \|\| !optionsQuery\.isSuccess \|\| !bounds\.valid \|\| !dirty\}/);
});

test('Save keeps submitting complete valid policy via the original backend PUT endpoint', () => {
  assert.match(editor, /<form onSubmit=\{save\}/);
  assert.match(editor, /validatePolicy\(draft, bounds\)/);
  assert.match(editor, /await organizationApi\.updateApiKeyPolicy\(selected\.uid, serializePolicy\(/);
  assert.match(editor, /invalidateQueries\(\{ queryKey: \['organization', 'api-keys'\] \}\)/);
  assert.match(api, /updateApiKeyPolicy: \(issuerApiKeyUid, payload\) =>\s*apiClient\.put\(ORGANIZATION_ENDPOINTS\.apiKeyPolicy\(issuerApiKeyUid\), payload/);
  assert.match(endpoints, /apiKeyPolicy: \(issuerApiKeyUid\) => `\/organizations\/me\/api-keys\/\$\{encodeURIComponent\(issuerApiKeyUid\)\}\/policy`/);
});
