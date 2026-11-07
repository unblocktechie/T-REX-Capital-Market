import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { WEEKDAYS, visibleAllowedDays, validatePolicy, serializePolicy, normalizePolicy } from '../src/utils/botPolicy.js';

const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const base = normalizePolicy({ allowedIps: ['8.8.8.8'], timezone: 'UTC' });

test('Every day marks all seven checkboxes while using the existing unrestricted backend wire format', () => {
  assert.deepEqual(visibleAllowedDays([]), WEEKDAYS);
  assert.deepEqual(visibleAllowedDays(null), WEEKDAYS);
  assert.deepEqual(visibleAllowedDays(['Mon', 'Tue']), ['Mon', 'Tue']);
  assert.equal(serializePolicy({ ...base, allowedDays: [] }).allowedDays, null);
  assert.match(editor, /checked=\{effectiveDays\.includes\(day\)\}/);
  assert.match(editor, /label === 'Every day' \? \[\] : days/);
  assert.match(editor, /effectiveDays\.filter\(\(v\) => v !== day\)/);
});

test('UTC schedule accepts overnight hours and rejects equal or incomplete windows', () => {
  assert.equal(validatePolicy({ ...base, startTime: '18:00', endTime: '09:00' }), '');
  assert.equal(validatePolicy({ ...base, startTime: '09:00', endTime: '18:00' }), '');
  assert.match(validatePolicy({ ...base, startTime: '09:00', endTime: '09:00' }), /different/);
  assert.match(validatePolicy({ ...base, startTime: '18:00', endTime: '' }), /both/);
  assert.equal(serializePolicy({ ...base, startTime: '18:00', endTime: '09:00' }).endTime, '09:00');
  assert.match(editor, /timezone: 'UTC'/);
  assert.match(editor, /scheduleHasLegacyZone/);
  assert.match(editor, /Use UTC/);
});

test('hours are always shown with visible UTC suffix and no editable timezone or anytime switch', () => {
  assert.match(editor, /id="bot-start-utc" type="time"/);
  assert.match(editor, /id="bot-end-utc" type="time"/);
  assert.match(editor, /aria-hidden="true">UTC<\/span>/);
  assert.doesNotMatch(editor, /bot-timezone/);
  assert.doesNotMatch(editor, /showTimeFields/);
  assert.doesNotMatch(editor, />Any time<\/button>/);
  assert.match(css, /\.bot-schedule__time-input input::-webkit-calendar-picker-indicator \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*?\.bot-schedule__time-grid \{ grid-template-columns: 1fr/);
});

test('schedule preview and controls use the original values, not invented bot runs or prices', () => {
  assert.match(editor, /Schedule preview/);
  assert.match(editor, /describeCooldown\(draft\.cooldownSeconds\)/);
  assert.match(editor, /scheduleDaysText/);
  assert.match(editor, /describeHours\(draft\.startTime, draft\.endTime\)/);
  assert.match(editor, /name="bot-update-frequency"/);
  assert.match(editor, /updateApiKeyPolicy\(selected\.uid/);
});
