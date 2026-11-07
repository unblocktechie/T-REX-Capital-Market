import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shouldConfirmBotTabSwitch } from '../src/utils/botTabNavigation.js';

const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const tabs = ['api-keys', 'network', 'protection', 'schedule'];

for (const source of tabs) {
  test(`${source}: edit, confirm before leaving for every other tab`, () => {
    const dirty = source === 'api-keys'
      ? { apiKeyDirty: true }
      : { policyDirty: true, unsavedPolicySections: { [source]: true } };
    for (const destination of tabs) {
      assert.equal(shouldConfirmBotTabSwitch(source, destination, dirty), source !== destination, `${source} to ${destination}`);
      assert.equal(shouldConfirmBotTabSwitch(source, destination, {}), false, `clean: ${source} to ${destination}`);
    }
  });
}

test('unsaved policy section blocks any destination, including another policy section', () => {
  for (const section of ['network', 'protection', 'schedule']) {
    assert.equal(shouldConfirmBotTabSwitch(section, 'schedule', {unsavedPolicySections: {[section]: true}}), section !== 'schedule');
  }
});

test('confirmation is wired to all four tab controls and the discard action resets the draft', () => {
  assert.match(page, /onClick=\{\(\) => changeTab\(id\)\}/);
  assert.match(page, /shouldConfirmBotTabSwitch\(tab, next, \{ apiKeyDirty, policyDirty, unsavedPolicySections \}\)/);
  assert.match(page, /setPendingTab\(next\)/);
  assert.match(page, /onClick=\{discardAndChangeTab\}/);
  assert.match(page, /<BotPolicyEditor key=\{tab\}/);
  assert.match(page, /setApiKeyDirty\(false\)/);
  assert.match(page, /setPolicyDirty\(false\)/);
  assert.match(page, /commitTab\(pendingTab\)/);
  assert.match(editor, /getUnsavedPolicySections\(draft, saved, pendingIp\)/);
});

test('unsaved tabs use dark slate borders and the matching bottom indicator, not yellow borders', () => {
  const section = css.slice(css.indexOf('/* Bot Configuration | neutral slate interaction palette'));
  assert.match(section, /\.bot-config \.bot-config__tab\.is-active::after \{ background: var\(--bot-selected-ink\); \}/);
  assert.match(section, /\.bot-config \.bot-config__tab\.is-active\.has-unsaved[\s\S]*?border-color: var\(--bot-selected-ink\);/);
  assert.doesNotMatch(section, /border-color: #b4935c|border-color: #dfb777/);
});
