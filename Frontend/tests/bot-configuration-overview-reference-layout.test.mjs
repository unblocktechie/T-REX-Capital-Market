import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const summary = page.slice(page.indexOf('<section className="bot-config__overview"'), page.indexOf('</section>', page.indexOf('<section className="bot-config__overview"')));

test('Learn more follows the heading, chips follow the description, progress and action stay in the side rail', () => {
  const heading = summary.indexOf('bot-config__overview-heading');
  const title = summary.indexOf('bot-config__overview-title');
  const help = summary.indexOf('bot-config__learn-more');
  const details = summary.indexOf('bot-config__overview-details');
  const requirements = summary.indexOf('bot-config__requirements');
  const rail = summary.indexOf('bot-config__overview-actions');
  const counter = summary.indexOf('bot-config__progress-count');
  const action = summary.indexOf('bot-config__wallet-action');
  assert.ok(heading < title && title < help && help < details && details < requirements && requirements < rail && rail < counter && counter < action);
});

test('chips are informational; help and Service Wallet CTA remain actionable', () => {
  assert.match(summary, /onClick=\{\(\) => setShowBotHelp\(true\)\}/);
  assert.doesNotMatch(summary, /onClick=\{\(\) => changeTab\(item\.id\)\}/);
  assert.match(summary, /<span role="listitem"/);
  assert.doesNotMatch(summary, /aria-label=\{`Service Wallet: .*Open token setup`\}/);
  assert.equal((summary.match(/onClick=\{openWalletSetup\}/g) || []).length, 1);
  assert.match(summary, /!ready && walletStatus\.code !== 'checking'/);
  assert.doesNotMatch(summary, /<span aria-hidden="true">→<\/span>/);
  assert.match(summary, /Number\(keyReady\) \+ Number\(ipReady\) \+ Number\(walletStatus\.ready\)/);
});

test('layout uses natural-height desktop side rail and wraps chips without mobile overflow', () => {
  assert.match(css, /\.bot-config \.bot-config__overview \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) max-content/);
  assert.match(css, /\.bot-config__overview-main \.bot-config__requirements \{\s*display: flex;\s*flex-direction: row;\s*flex: 0 0 auto;\s*flex-wrap: wrap/);
  assert.match(css, /@media \(max-width: 720px\) \{\s*\.bot-config \.bot-config__overview \{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.bot-config__overview-actions \.bot-config__wallet-action \{\s*grid-column: 1;\s*grid-row: 3/);
});
