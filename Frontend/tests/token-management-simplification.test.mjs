import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');
const section = page.slice(page.indexOf('  return (\n    <div className="token-details-page token-dashboard-page">'));

test('renders one overview, Investor Access, Investment Limits and one technical disclosure, without the Asset Management card', () => {
  assert.equal((section.match(/<h2>Investor Access<\/h2>/g) || []).length, 1);
  assert.equal((section.match(/<h2>Investment Limits<\/h2>/g) || []).length, 1);
  assert.equal((section.match(/<h2>Asset Management<\/h2>/g) || []).length, 0);
  assert.equal((section.match(/<HelpDetails\b/g) || []).length, 1);
  assert.match(section, /<HelpDetails title="Technical Details"/);
  assert.doesNotMatch(section, /token-dashboard-metrics|Technical asset information|Who Manages This Asset|Investor Checks<\/h2>/);
});

test('does not discard existing technical addresses and links', () => {
  for (const field of [
    'Unit precision', 'Asset contract address', 'Organization payment account',
    'Organization verification record', 'Approved investor list',
    'Platform registry storage', 'Verification provider account',
    'Investor approval account', 'Asset operations account',
  ]) assert.ok(section.includes(`label="${field}"`), `Missing ${field}`);
  assert.match(section, /href=\{transactionExplorer\}/);
  assert.match(section, /explorerUrl=\{tokenExplorer\}/);
  assert.match(section, /copyLabel="Copy asset contract address"/);
  assert.match(section, /Reviews and approves who can invest in this asset\./);
  assert.match(section, /Handles asset units and important transfer controls\./);
  assert.doesNotMatch(section, /Management capabilities|token-dashboard-permissions/);
  assert.match(section, /<strong>Investor Approvals<\/strong>/);
  assert.match(section, /<strong>Asset Operations<\/strong>/);
  assert.match(section, /<StatusBadge status=\{agents\.identityRegistryAgent\?\.address \? 'valid' : 'warning'\}>/);
  assert.match(section, /<StatusBadge status=\{agents\.tokenAgent\?\.address \? 'valid' : 'warning'\}>/);
});

test('keeps price update, setup recovery, and derived backend compliance and investor roles', () => {
  for (const requirement of [
    'onClick={openPriceEditor}', 'onClick={resumeIncompleteSetup}', 'onClick={handlePriceUpdate}',
    'setPlatformTokenPrice({', 'saveTokenPriceSyncRecovery(', 'updateCurrentPrice(confirmedPrice)',
    'claimTopics.map((topic)', 'compliance.maximumInvestors', 'compliance.maximumBalance',
    'compliance.countries', 'agents.identityRegistryAgent?.address', 'agents.tokenAgent?.address',
    'identityRegistryAddress', 'identityRegistryStorageAddress',
  ]) assert.ok(page.includes(requirement), `Missing ${requirement}`);
});

test('supports mobile stacking, full-width addresses, and no new global page overrides', () => {
  assert.match(css, /\.token-dashboard-pricing\s*\{/);
  assert.match(css, /\.token-dashboard-technical__group \.issuance-address code\s*\{[^}]*overflow-wrap: anywhere;/s);
  assert.match(css, /@media \(max-width: 620px\)\s*\{\s*\.token-dashboard-header--simplified/s);
  assert.match(css, /\.token-dashboard-pricing\s*\{\s*align-items: stretch;\s*flex-direction: column;/s);
  assert.match(css, /\.token-dashboard-role-grid\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(css, /@media \(max-width: 840px\)\s*\{\s*\.token-dashboard-role-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/s);
  assert.match(css, /\.token-dashboard-page \.token-dashboard-technical__group \.issuance-address small\s*\{[^}]*font-size: 13px;/s);
  assert.match(css, /\.token-dashboard-page \.token-dashboard-technical__group \.issuance-address code\s*\{[^}]*font-size: 14px;/s);
});
