import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const picker = await readFile(new URL('../src/components/issuer/BotKeyPicker.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

test('required setup progress is derived from active keys and saved allowlists', () => {
  assert.match(page, /const keyReady = keysQuery\.isSuccess && activeKeys\.length > 0/);
  assert.match(page, /const ipReady = loaded && savedEligibleKeys\.length > 0/);
  assert.match(page, /Number\(keyReady\) \+ Number\(ipReady\) \+ Number\(walletStatus\.ready\)/);
  assert.match(page, /'Bot setup complete'/);
  assert.match(page, /getBotWalletReadiness/);
});

test('Learn more opens an accessible modal with the requested explanation', () => {
  assert.match(page, /onClick=\{\(\) => setShowBotHelp\(true\)\}/);
  assert.match(page, /<Modal open=\{showBotHelp\}/);
  assert.match(page, /title="Set Up Your Price Update Bot" trapFocus/);
  for (const phrase of [
    'a registered <strong>Service Wallet</strong>',
    'Each API key can have its own list of allowed IP addresses',
    'Set limits on how much the token price can increase or decrease',
    'Choose which days and times your bot can update prices',
    'These settings are optional and give you more control over your bots',
  ]) assert.ok(page.includes(phrase), `Missing help content: ${phrase}`);
});

test('picker floats instead of stretching page and handles viewport edges', () => {
  assert.match(css, /\.bot-key-picker__menu \{ position: absolute/);
  assert.match(css, /\.bot-key-picker__options \{ max-height: min\(172px, 34dvh\); overflow: auto/);
  assert.match(picker, /setShowAbove\(spaceBelow < 235/);
  assert.match(picker, /window\.addEventListener\('scroll', positionMenu, true\)/);
  assert.match(picker, /document\.addEventListener\('pointerdown', dismiss\)/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /onChange\(key\.uid\)/);
});

test('compact responsive summary shows status badges without redirecting when clicked', () => {
  assert.doesNotMatch(page, /changeTab\(item\.id\)/);
  assert.match(page, /<span role="listitem"/);
  assert.match(css, /\.bot-config__overview-actions \{/);
  assert.match(css, /@media \(max-width: 620px\)/);
});
