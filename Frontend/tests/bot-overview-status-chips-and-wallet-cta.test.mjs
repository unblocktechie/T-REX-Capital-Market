import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const summary = page.split('<section className="bot-config__overview"')[1]?.split('</section>')[0] || '';

test('setup chips are semantic, noninteractive status indicators', () => {
  assert.match(summary, /className="bot-config__requirements" role="list"/);
  assert.equal((summary.match(/<span role="listitem"/g) || []).length, 2);
  assert.doesNotMatch(summary, /onClick=\{\(\) => changeTab\(item\.id\)\}/);
  const badgeArea = summary.split('<div className="bot-config__requirements"')[1].split('</div>')[0];
  assert.doesNotMatch(badgeArea, /<button|onClick|Open settings|Open token setup/);
  assert.doesNotMatch(styles, /bot-config__requirement:hover/);
  assert.match(styles, /\.bot-config \.bot-config__overview-main \.bot-config__requirement \{[\s\S]*?background: #fff7ed;/);
  assert.match(styles, /\.bot-config \.bot-config__overview-main \.bot-config__requirement\.is-complete \{[\s\S]*?background: #ecfdf5;/);
});

test('service wallet CTA remains the only card navigation, with sidebar colors and no arrow', () => {
  assert.equal((summary.match(/onClick=\{openWalletSetup\}/g) || []).length, 1);
  assert.doesNotMatch(summary, /→/);
  assert.match(summary, /Set up Service Wallet/);
  assert.match(styles, /\.bot-config \.bot-config__overview-actions \.bot-config__wallet-action \{[\s\S]*?background: var\(--sidebar-bg\)/);
  assert.match(styles, /\.bot-config \.bot-config__overview-actions \.bot-config__wallet-action:hover \{[\s\S]*?transform: translateY\(-1px\)/);
});

test('cooldown omits range hint but preserves unit-specific error and limits', () => {
  assert.doesNotMatch(editor, /Allowed: \{bounds\.cooldownMin\.toLocaleString\(\)\}/);
  assert.doesNotMatch(editor, /id="bot-cooldown-help"/);
  assert.match(editor, /aria-describedby=\{cooldownError \? 'bot-cooldown-error' : undefined\}/);
  assert.match(editor, /role="alert" className="bot-schedule__cooldown-error"/);
  assert.match(editor, /cooldownError/);
  assert.match(editor, /bounds\.cooldownMin/);
  assert.match(editor, /bounds\.cooldownMax/);
});
