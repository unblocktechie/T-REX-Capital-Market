import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validatePolicy, serializePolicy } from '../src/utils/botPolicy.js';

const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

test('Price Protection has distinct panels, presets above custom fields, and a live rules summary', () => {
  assert.match(editor, /function ProtectionLimit\(/);
  assert.match(editor, /bot-protection__rule-heading[\s\S]*?bot-protection__presets[\s\S]*?Custom limit \(%\)/);
  for (const text of ['Maximum change per update', '24-hour total movement', 'Your protection rules']) {
    assert.ok(editor.includes(text), `${text} is missing`);
  }
  assert.match(editor, /\['5', '10', '25'\]/);
  assert.match(editor, /onClick=\{\(\) => onChange\(''\)\}>Off/);
});

test('Price Protection preserves exact draft values, validated ranges, and complete saved policy', () => {
  assert.match(editor, /value=\{draft.threshold\} onChange=\{\(value\) => change\('threshold', value\)\}/);
  assert.match(editor, /value=\{draft.maxCumulative24hPercent\} onChange=\{\(value\) => change\('maxCumulative24hPercent', value\)\}/);
  assert.match(editor, /validatePolicy\(draft, bounds\)/);
  assert.match(editor, /updateApiKeyPolicy\(selected.uid, serializePolicy/);
  assert.match(editor, /dirty \? 'Preview of unsaved changes/);
  assert.doesNotMatch(editor, /navigator\.clipboard|copyPriceRules|Copy rules/);
  const payload = serializePolicy({ threshold: '24.75', maxCumulative24hPercent: '10', cooldownSeconds: '300', allowedIps: '8.8.8.8' });
  assert.equal(payload.threshold, '24.75');
  assert.equal(payload.maxCumulative24hPercent, '10');
  assert.equal(payload.cooldownSeconds, '300');
  assert.deepEqual(payload.allowedIps, ['8.8.8.8']);
  assert.equal(validatePolicy({allowedIps:'8.8.8.8', threshold:'24.75', maxCumulative24hPercent:'10'}), '');
  assert.match(validatePolicy({allowedIps:'8.8.8.8', threshold:'100.01'}), /100%/);
});

test('Two-column cards collapse for tablet/mobile with accessible focus states and teal design', () => {
  assert.match(css, /bot-protection__rules \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 750px\) \{ \.bot-protection__rules \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /\.bot-protection__presets button\.is-selected \{[^}]*#0f766e/);
  assert.match(editor, /aria-invalid=\{!valid\}/);
  assert.match(editor, /aria-pressed=\{value === preset\}/);
});
