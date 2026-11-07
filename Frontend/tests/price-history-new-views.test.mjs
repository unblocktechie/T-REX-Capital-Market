import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  historyChartCoordinates, priceHistoryActor, priceHistoryGraphRows, priceHistoryMethod,
  priceGraphStartDate,
} from '../src/services/price-history/priceHistory.utils.js';
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('table methods use Manual and Bot for legacy and relayed modes, with manual fallback for historical indexed events', () => {
  assert.equal(priceHistoryMethod({ submissionMode: 'LEGACY' }), 'Manual');
  assert.equal(priceHistoryMethod({ submissionMode: 'RELAYED' }), 'Automated (bot)');
  assert.equal(priceHistoryMethod({ submissionMode: 'relayed' }), 'Automated (bot)');
  assert.equal(priceHistoryMethod({ submissionMode: 'Manual' }), 'Manual');
  assert.equal(priceHistoryMethod({ submissionMode: 'Manual' }), 'Manual');
  assert.equal(priceHistoryMethod({ isLegacyUpdate: true }), 'Manual');
  assert.equal(priceHistoryMethod({ updateType: 'Manual' }), 'Manual');
  assert.equal(priceHistoryMethod({ updateType: 'Automated (bot)' }), 'Automated (bot)');
  assert.equal(priceHistoryMethod({}), '—');
  assert.equal(priceHistoryActor({}), '—');
  assert.equal(priceHistoryActor({ updatedByWalletAddress: '0x' + 'a'.repeat(40) }), '0x' + 'a'.repeat(40));
  assert.equal(priceHistoryActor({ signerWalletAddress: '0x' + 'a'.repeat(40) }), '—');
  assert.equal(priceHistoryMethod({ updateType: 'Automated (bot)', isLegacyUpdate: true }), 'Automated (bot)');
});

test('time periods use calendar months and exclude non-final updates', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  assert.equal(priceGraphStartDate(2, now).toISOString(), '2026-09-01T12:00:00.000Z');
  const sample = (status, createdAt, price) => ({ status, createdAt, newPriceFormatted: price });
  const rows = [
    sample('APPLIED', '2026-10-05T12:00:00Z', '1.01'),
    sample('PENDING', '2026-10-06T12:00:00Z', '99'),
    sample('FAILED', '2026-10-07T12:00:00Z', '20'),
    sample('CONFIRMED', '2026-09-09T12:00:00Z', '1.02'),
    sample('APPLIED', '2026-05-09T12:00:00Z', '1'),
  ];
  assert.deepEqual(priceHistoryGraphRows(rows, 3, now).map((row) => row.newPriceFormatted), ['1.02', '1.01']);
  assert.equal(priceHistoryGraphRows(rows, 6, now).length, 3);
});

test('plotting precision preserves large decimal price strings', () => {
  const rows = [
    { createdAt: '2026-10-01', newPriceFormatted: '123456789012345678.000000000000000001' },
    { createdAt: '2026-10-02', newPriceFormatted: '123456789012345678.000000000000000002' },
  ];
  const coords = historyChartCoordinates(rows);
  assert.equal(coords[0].y, 100);
  assert.equal(coords[1].y, 0);
  assert.equal(rows[0].newPriceFormatted, '123456789012345678.000000000000000001');
});

test('issuer summary, dedicated route and investor graph stay separated', () => {
  const issuer = read('../src/pages/tokens/TokenDetailsPage.jsx');
  const investor = read('../src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  const full = read('../src/pages/tokens/TokenPriceHistoryPage.jsx');
  const query = read('../src/components/price-history/useHistoryData.js');
  assert.match(issuer, /<IssuerPriceHistory\s+compact/);
  assert.match(investor, /<PriceHistoryGraph\s+viewer="investor"/);
  assert.match(investor, /<IssuerPriceHistory[\s\S]*?viewer="investor"/);
  assert.match(full, /<PriceHistoryGraph/);
  assert.match(full, /<IssuerPriceHistory/);
  assert.match(query, /limit: 100/);
  assert.match(query, /MAX_GRAPH_PAGES/);
  assert.match(query, /assertPriceHistoryAssetMatch/);
});

test('full price-history page has no back-to-asset-details shortcut', () => {
  const full = read('../src/pages/tokens/TokenPriceHistoryPage.jsx');
  assert.doesNotMatch(full, /Back to asset details|price-history-back|<ArrowLeft/);
  assert.match(full, /<PriceHistoryGraph/);
  assert.match(full, /<IssuerPriceHistory/);
});

test('shared issuer/investor price-history tables include method and status chips and price direction, preserving explorer links and payment icons', () => {
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  const graph = read('../src/components/price-history/PriceHistoryGraph.jsx');
  const details = read('../src/pages/tokens/TokenDetailsPage.jsx');
  const full = read('../src/pages/tokens/TokenPriceHistoryPage.jsx');
  const investor = read('../src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  assert.match(table, /<span>Date and Time<\/span><span>Previous Price<\/span><span>New Price<\/span><span>Method<\/span><span>Status<\/span><span>Transaction<\/span>/);
  assert.match(table, /data-label="Status"/);
  assert.match(table, /<PriceHistoryStatusChip status=\{row\.status\}/);
  assert.match(table, /<PriceHistoryChangeIndicator previous=\{row\.oldPriceFormatted\} current=\{row\.newPriceFormatted\} status=\{row\.status\}/);
  assert.doesNotMatch(table, /Updated By \(Wallet Address\)|priceHistoryActor|price-history-footer-note/);
  assert.match(table, /data-label="Method"/);
  assert.match(table, /<PriceHistoryMethodChip row=\{row\}/);
  assert.match(table, /transactionExplorerUrl\(row.transactionHash, row.chainId \|\| chainId\)/);
  assert.match(table, /<ExternalLink size=\{14\}/);
  assert.match(table, /<TokenIcon size="xs"/);
  assert.match(table, /<CommonPriceValue value=\{value\}/);
  assert.doesNotMatch(table, /className="price-history-price" title=/);
  assert.match(table, /setPage\(\(current\) => current \+ 1\)/);
  assert.match(details, /imageUrl=\{paymentTokenMetadata.imageUrl\}/);
  assert.match(investor, /viewer="investor"/);
  assert.match(investor, /imageUrl=\{paymentToken.imageUrl\}/);
  assert.match(full, /usePaymentTokenMetadata/);
  const css = read('../src/assets/styles/price-history.css');
  assert.match(css, /grid-template-columns: minmax\(125px, 1\.26fr\).*minmax\(91px, \.74fr\).*minmax\(120px, 1fr\)/);
  assert.match(css, /\.price-history-method--manual\s*\{/);
  assert.match(css, /\.price-history-status--success\s*\{/);
  assert.match(css, /\.price-history-cell--transaction\s*\{\s*grid-column: 1 \/ -1/);
  // Shared selected price shows the exact recorded update in line view.
  assert.match(graph, /displayPriceTwoDecimals\(currentPrice\)/);
});

test('date column displays request date only, with no secondary confirmation timestamp', () => {
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(table, /<strong>\{priceHistoryDate\(row\.createdAt\)\}<\/strong>/);
  assert.doesNotMatch(table, /Confirmed:\s*\{priceHistoryDate\(row\.confirmedAt\)\}/);
});

test('issuer latest-price preview shows at most three records without pagination', () => {
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  const issuer = read('../src/pages/tokens/TokenDetailsPage.jsx');
  const full = read('../src/pages/tokens/TokenPriceHistoryPage.jsx');
  assert.match(issuer, /<IssuerPriceHistory\s+compact/);
  assert.match(table, /const pageSize = compact \? 3 : investor \? 5 : 10/);
  assert.match(table, /viewer, page, limit: pageSize/);
  assert.match(table, /visibleItems = items\.slice\(0, pageSize\)/);
  assert.match(table, /visibleItems\.map/);
  assert.match(table, /\{!compact && query\.enabled && !query\.isError && totalPages > 0 \? \(/);
  assert.match(table, /View Full History/);
  assert.match(full, /<IssuerPriceHistory/);
  assert.match(table, /className="price-history-pagination"/);
});
