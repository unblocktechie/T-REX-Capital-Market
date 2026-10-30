import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const details = readFileSync(new URL('src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx', root), 'utf8');
const styles = readFileSync(new URL('src/assets/styles/investor.css', root), 'utf8');

test('requirements omit redundant investment-limit row but preserve eligibility and transfer checks', () => {
  assert.doesNotMatch(details, /<ComplianceRule[^>]*title="Investment limits"/);
  assert.match(details, /eligibilityTopics\.map/);
  assert.match(details, /title="Transfer rules"/);
  assert.match(details, /What You Need Before Investing/);
});

test('maximum holdings still comes from token data in key investment details', () => {
  assert.match(details, /<SnapshotCard label="Maximum holdings">/);
  assert.match(details, /token\.maxBalance/);
  assert.match(details, /<SnapshotCard label="Maximum investors">/);
});

test('asset status badge stays independent of name and aligned to right side', () => {
  assert.match(details, /<header className="marketplace-token-detail-header marketplace-investment-overview__header">/);
  assert.match(details, /<MarketplaceStatusBadge status=\{token\.status\} compact \/>/);
  assert.match(styles, /\.marketplace-investment-overview__header > \.app-status-badge\s*\{[^}]*margin-left:\s*auto;/);
  assert.match(styles, /\.marketplace-investment-overview__header \.marketplace-token-detail-header__identity\s*\{[^}]*min-width:\s*0;/);
});

test('layout preserves mobile wrapping with stable status alignment', () => {
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.marketplace-investment-overview__header\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(styles, /\.marketplace-investment-overview__header > \.app-status-badge\s*\{[^}]*align-self:\s*flex-start;/);
});
