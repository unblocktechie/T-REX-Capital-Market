import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const latest = css.substring(css.indexOf('/* Bot Configuration | neutral slate interaction palette (2026-10-23)'));

test('selected bot configuration cards use the approved neutral palette', () => {
  assert.match(latest, /--bot-selected-bg:\s*#f1f5f9/);
  assert.match(latest, /--bot-selected-border:\s*#94a3b8/);
  assert.match(latest, /--bot-selected-ink:\s*#334155/);
  assert.match(latest, /--bot-preview-bg:\s*#f8fafc/);
  assert.match(latest, /\.bot-config \.bot-config__tab\.is-active\s*\{[^}]*background: var\(--bot-selected-bg\)/s);
  assert.match(latest, /\.bot-config \.bot-config__tab\.is-active::after\s*\{ background: var\(--bot-selected-ink\); \}/);
  assert.match(latest, /\.bot-config \.bot-config__tab\.is-active \.bot-config__tab-symbol/);
});

test('dropdown, presets, day toggles, and price protection selections share slate interaction styling', () => {
  for (const name of ['bot-config__presets', 'bot-config__day-presets', 'bot-config__expiry-presets', 'bot-config__weekday-options', 'bot-config__choice', 'bot-protection__presets']) {
    assert.ok(latest.includes(name), `Missing neutral treatment for ${name}`);
  }
  assert.match(latest, /\.bot-config \.bot-key-picker__option\.is-highlighted/);
  assert.match(latest, /\.bot-config \.bot-key-picker__search:focus-within/);
});

test('both rule preview panels are light slate and semantic unsaved/error/ready handling remains', () => {
  assert.match(latest, /\.bot-config \.bot-schedule__summary\s*\{\s*background: var\(--bot-preview-bg\)/);
  assert.match(latest, /\.bot-config \.bot-protection__summary\s*\{\s*background: var\(--bot-preview-bg\)/);
  assert.match(latest, /\.bot-config \.bot-config__tab\.is-active\.has-unsaved/);
  assert.match(page, /is-attention/);
  assert.match(page, /hasUnsavedChanges/);
  assert.match(editor, /validatePolicy\(draft, bounds\)/);
  assert.match(editor, /updateApiKeyPolicy\(selected\.uid, serializePolicy/);
});
