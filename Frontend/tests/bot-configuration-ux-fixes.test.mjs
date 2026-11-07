import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DEFAULT_POLICY_LIMITS, validateAllowedIps, normalizePolicyOptions, serializePolicy, normalizePolicy } from '../src/utils/botPolicy.js';

const load = (file) => readFile(new URL(`../src/components/issuer/${file}`, import.meta.url), 'utf8');
const editor = await load('BotPolicyEditor.jsx');
const picker = await load('BotKeyPicker.jsx');
const ip = await load('BotIpAllowlistInput.jsx');
const create = await load('IssuerApiKeysCard.jsx');
const styles = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

test('Schedule checkbox indicator icon is imported rather than crashing at render', () => {
  assert.match(editor, /ChevronRight, Check, Hourglass/);
  assert.match(editor, /<Check size=\{12\}/);
});
test('IP entry requires Add, validates single address and supports remove', () => {
  assert.match(ip, /setPending\(''\)/);
  assert.match(ip, /onClick=\{add\}/);
  assert.match(ip, /onClick=\{\(\) => remove\(index\)\}/);
  assert.match(ip, /isValidIpAddress\(next\)/);
  assert.match(ip, /addresses.length >= max/);
  assert.match(ip, /onChange\(\[\.\.\.addresses, next\]\.join\('\\n'\)\)/);
  assert.match(ip, /No IP addresses added/);
  assert.match(create, /<BotIpAllowlistInput/);
  assert.match(editor, /<BotIpAllowlistInput/);
  assert.match(editor, /Click Add address to include the typed IP before saving/);
});
test('IP count respects backend configurable options with fallback to three', () => {
  assert.equal(DEFAULT_POLICY_LIMITS.ipMax, 3);
  const config = normalizePolicyOptions({ allowedIpsMin: 1, allowedIpsMax: 2 });
  assert.equal(config.ipMax, 2);
  assert.match(validateAllowedIps(['8.8.8.8', '1.1.1.1', '9.9.9.9'], config), /1–2/);
  assert.equal(validateAllowedIps(['8.8.8.8', '1.1.1.1'], config), '');
  assert.deepEqual(serializePolicy(normalizePolicy({ allowedIps: ['8.8.8.8'] })).allowedIps, ['8.8.8.8']);
  assert.equal(normalizePolicy().allowedIps, '');
});
test('API key search opens a compact overlay, has keyboard controls and unique focus ring', () => {
  assert.match(picker, /onKeyDown=\{onSearchKeyDown\}/);
  assert.match(picker, /Search API keys/);
  assert.match(styles, /\.bot-key-picker__menu\s*\{\s*position: absolute/);
  assert.match(styles, /\.bot-key-picker__menu\.is-above/);
  assert.match(picker, /window\.addEventListener\('resize', positionMenu\)/);
  assert.match(styles, /\.bot-config \.bot-key-picker__search input:focus-visible[\s\S]*outline: none !important/);
});
test('Price field wrappers have a single focus ring and step cards use teal active state', () => {
  assert.match(styles, /\.bot-config \.bot-config__input-suffix input:focus-visible[\s\S]*outline: none !important/);
  assert.match(styles, /\.bot-config__tab\.is-active\s*\{[^}]*#edf7f3/);
  assert.match(editor, /value=\{draft.threshold\}/);
  assert.match(editor, /value=\{draft.maxCumulative24hPercent\}/);
});
