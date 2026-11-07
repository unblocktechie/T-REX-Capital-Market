import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

test('API readiness panel uses its available width for status and actions without adding dummy data', () => {
  assert.match(page, /<div className="bot-config__overview-main">/);
  assert.match(page, /<div className="bot-config__overview-actions">/);
  assert.match(page, /<span className="bot-config__progress-count"/);
  assert.match(page, /Number\(keyReady\) \+ Number\(ipReady\)/);
  assert.doesNotMatch(page, /changeTab\(item\.id\)/);
  assert.match(page, /<span role="listitem"/);
  assert.match(page, /onClick=\{\(\) => setShowBotHelp\(true\)\}/);
  assert.match(css, /\.bot-config__overview \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) minmax\(248px, 290px\)/);
  assert.match(css, /@media \(max-width: 890px\) \{[\s\S]*?\.bot-config__overview \{ grid-template-columns: 1fr/);
});

test('cooldown stays compact alongside frequency cards and retains all policy choices', () => {
  assert.match(editor, /id="bot-cooldown"/);
  assert.match(editor, /value=\{cooldownAmount\}/);
  assert.match(editor, /id="bot-cooldown-unit"/);
  assert.match(editor, /COOLDOWN_UNITS\.map/);
  assert.match(editor, /bounds\.cooldownMin/);
  assert.match(editor, /bounds\.cooldownMax/);
  assert.match(css, /\.bot-config__schedule-spacing \{ align-items: start; \}/);
  assert.match(css, /\.bot-config__schedule-spacing > \.bot-config__field \{[\s\S]*?align-content: start;/);
  assert.match(css, /\.bot-config__schedule-spacing \.bot-config__input-suffix \{[\s\S]*?height: 45px;/);
});
