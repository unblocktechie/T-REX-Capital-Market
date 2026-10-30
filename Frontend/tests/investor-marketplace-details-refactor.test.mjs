import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = new URL('../', import.meta.url);
const mapperSource = readFileSync(new URL('src/api/investments/investment.mapper.js', base), 'utf8');
const detailsSource = readFileSync(new URL('src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx', base), 'utf8');
const cssSource = readFileSync(new URL('src/assets/styles/investor.css', base), 'utf8');

// Map with the real mapper and a payment-context stub; no network or dependencies required.
const loadMapper = () => import(`data:text/javascript,${encodeURIComponent(mapperSource.replace(
  "import { paymentContextOf } from '@/config/payment-tokens';",
  'const paymentContextOf = () => ({});',
))}`);

test('current investors reads the token API holderSummary.currentHolders field', async () => {
  const { mapMarketplaceToken } = await loadMapper();
  const mapped = mapMarketplaceToken({
    tokenUid: 'token-a',
    holderSummary: { totalInvestors: 15, currentHolders: 7, formerHolders: 8 },
  });
  assert.equal(mapped.currentInvestors, 7);
});

test('a real zero current-holder count renders as zero, not unavailable', async () => {
  const { mapMarketplaceToken } = await loadMapper();
  const mapped = mapMarketplaceToken({
    tokenUid: 'token-b',
    holderSummary: { totalInvestors: 0, currentHolders: 0, formerHolders: 0 },
  });
  assert.equal(mapped.currentInvestors, 0);
});

test('retains old investment counts as a fallback if the holder summary is absent', async () => {
  const { mapMarketplaceToken } = await loadMapper();
  assert.equal(mapMarketplaceToken({ tokenUid: 'a', currentInvestors: 11 }).currentInvestors, 11);
  assert.equal(mapMarketplaceToken({ tokenUid: 'b', investorCount: 13 }).currentInvestors, 13);
  assert.equal(mapMarketplaceToken({ tokenUid: 'c' }).currentInvestors, null);
});

test('investment overview groups status, details, description, requirements and technical information', () => {
  assert.match(detailsSource, /className="marketplace-investment-overview"/);
  for (const label of ['Key investment details', 'Current investors', 'Maximum investors', 'About This Investment', 'What You Need Before Investing', 'Technical details']) {
    assert.ok(detailsSource.includes(label), `${label} should remain available`);
  }
  assert.match(detailsSource, /<ExpandableInvestmentDescription paragraphs=/);
  assert.match(detailsSource, /aria-expanded=\{expanded\}/);
  assert.match(detailsSource, /Read more/);
  assert.match(detailsSource, /Show less/);
});

test('investment actions and verification remain available in the separate side panel', () => {
  for (const action of ['onInvest', 'onSend', 'onRedeem', 'onPrimaryAction', 'ComplianceStatus', 'UploadMissingDocumentsModal', 'SubmitInterestModal']) {
    assert.ok(detailsSource.includes(action), `${action} must not be removed`);
  }
});

test('responsive grid shows two metrics per row with a narrow mobile fallback', () => {
  assert.match(cssSource, /\.marketplace-investment-overview__details \.marketplace-snapshot-grid--friendly\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /@media \(max-width: 350px\)/);
  assert.match(cssSource, /\.marketplace-investment-description__text\.is-clamped/);
});
