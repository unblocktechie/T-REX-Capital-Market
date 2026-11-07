import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getUnsavedPolicySections, normalizePolicy } from '../src/utils/botPolicy.js';

const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const card = await readFile(new URL('../src/components/issuer/IssuerApiKeysCard.jsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

const removed = [
  'Find your bot server’s public egress IP with your hosting provider. Private and local development IPs are not accepted.',
  'Both limits are optional. Choose a preset or enter a custom percentage (up to two decimals). Rules apply to API-key price updates and are enforced by the backend.',
  'These optional limits are checked by the backend against confirmed price history, including manual changes.',
  'When both cooldown and frequency are set, both restrictions must pass. Start time is inclusive; end time is exclusive. Identical start and end times are not allowed.',
  'These are enforcement windows, not a job scheduler. Your bot still needs to initiate updates itself.',
];

test('removes precisely the five requested helper lines without altering the fields', () => {
  for (const line of removed) assert.ok(!editor.includes(line), `Unwanted text remains: ${line}`);
  for (const field of ['threshold', 'maxCumulative24hPercent', 'cooldownSeconds', 'frequency', 'allowedDays', 'startTime', 'endTime']) {
    assert.ok(editor.includes(field), `${field} field unexpectedly removed`);
  }
  assert.match(editor, /validatePolicy\(draft, bounds\)/);
  assert.match(editor, /updateApiKeyPolicy\(selected\.uid, serializePolicy/);
});

test('removes only per-key policy CTA; preserves replacement, disable and policy tabs', () => {
  assert.doesNotMatch(card, /Edit policy|Set up security/);
  assert.match(card, /Replace key/);
  assert.match(card, /Disable key/);
  assert.match(card, /Create API key/);
  assert.match(page, /Network Security/);
  assert.match(page, /Price Protection/);
  assert.match(page, /Update Schedule/);
});

test('unsaved flags are false for a pristine draft and only true for edited sections', () => {
  const saved = {allowedIps:['49.36.89.50'], threshold:'5', maxCumulative24hPercent:'10', cooldownSeconds:'300', frequency:'weekly', allowedDays:['Mon','Tue'],startTime:'18:00', endTime:'09:00', timezone:'UTC'};
  const draft = normalizePolicy(saved);
  assert.deepEqual(getUnsavedPolicySections(draft, saved), {network:false,protection:false,schedule:false});
  assert.deepEqual(getUnsavedPolicySections({...draft, threshold:'25'},saved), {network:false,protection:true,schedule:false});
  assert.deepEqual(getUnsavedPolicySections({...draft, cooldownSeconds:'600'},saved), {network:false,protection:false,schedule:true});
  assert.deepEqual(getUnsavedPolicySections({...draft, allowedIps:'49.36.89.50\n8.8.8.8'},saved), {network:true,protection:false,schedule:false});
  assert.deepEqual(getUnsavedPolicySections(draft,saved,'8.8.8.8'), {network:true,protection:false,schedule:false});
  assert.deepEqual(getUnsavedPolicySections({...draft, threshold:'25',frequency:'daily'},saved), {network:false,protection:true,schedule:true});
  assert.deepEqual(getUnsavedPolicySections({...draft, threshold:'5'},saved), {network:false,protection:false,schedule:false});
});

test('tab badges and subtle focus styling show only for actual unsaved edits', () => {
  assert.match(page, /const hasUnsavedChanges = id === 'api-keys' \? apiKeyDirty : unsavedPolicySections\[id\]/);
  assert.match(page, /hasUnsavedChanges \? 'Unsaved changes' : statuses\[id\]/);
  assert.match(editor, /getUnsavedPolicySections\(draft, saved, pendingIp\)/);
  assert.match(editor, /onSectionDirtyChange\?\.\(unsavedSections\)/);
  assert.match(card, /onUnsavedChange\?\.\(Boolean\(open &&/);
  assert.match(css, /\.bot-config__tab\.has-unsaved/);
  assert.doesNotMatch(editor, /No unsaved changes/);
});
