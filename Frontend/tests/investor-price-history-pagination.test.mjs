import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePriceHistoryQuery, normalizePriceHistoryResponse } from '../src/services/price-history/priceHistory.utils.js';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('investor history requests 5 per page without altering the issuer 10-record history or compact preview', () => {
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(table, /const investor = viewer === 'investor'/);
  assert.match(table, /const pageSize = compact \? 3 : investor \? 5 : 10/);
  assert.match(table, /viewer, page, limit: pageSize/);
  assert.match(table, /visibleItems = items\.slice\(0, pageSize\)/);
  assert.deepEqual(normalizePriceHistoryQuery({ page: 1, limit: 5, tokenUid: 'token-1' }), {
    page: 1, limit: 5, source: 'all', status: 'all', search: '', tokenUid: 'token-1',
  });
  assert.equal(normalizePriceHistoryQuery({ page: 3, limit: 20 }).limit, 20);
});

test('24 investor records produce five backend-driven pages, keeping the page and total', () => {
  const result = normalizePriceHistoryResponse({
    data: Array.from({ length: 5 }, (_, i) => ({ priceUpdateUid: `id-${i}` })),
    meta: { pagination: { page: 2, limit: 5, total: 24, totalPages: 5 } },
  });
  assert.equal(result.items.length, 5);
  assert.deepEqual(result.pagination, { page: 2, limit: 5, total: 24, totalPages: 5 });
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(table, /Showing \${firstRecord}–\${lastRecord} of \${totalRecords} updates/);
  assert.match(table, /aria-current=\{page === number \? 'page' : undefined\}/);
  assert.match(table, /onClick=\{\(\) => setPage\(number\)\}/);
  assert.match(table, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(table, /setPage\(\(current\) => current \+ 1\)/);
  assert.match(table, /totalPages > 0 && page > totalPages/);
});

test('responsive investor pagination preserves existing table and mobile behavior', () => {
  const css = read('../src/assets/styles/price-history.css');
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(css, /\.price-history-pagination__controls \{/);
  assert.match(css, /flex-wrap: wrap/);
  assert.match(css, /\.price-history-pagination__page:focus-visible/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(table, /<PriceHistoryMethodChip row=\{row\}/);
  assert.match(table, /<PriceHistoryStatusChip status=\{row\.status\}/);
  assert.match(table, /<PriceHistoryChangeIndicator previous=\{row\.oldPriceFormatted\} current=\{row\.newPriceFormatted\}/);
});
