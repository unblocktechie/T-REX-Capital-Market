import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePriceHistoryQuery, normalizePriceHistoryResponse } from '../src/services/price-history/priceHistory.utils.js';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('full issuer history requests 10 rows per backend page, investor uses 5 and preview uses 3', () => {
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  const full = read('../src/pages/tokens/TokenPriceHistoryPage.jsx');
  const preview = read('../src/pages/tokens/TokenDetailsPage.jsx');
  assert.match(table, /const pageSize = compact \? 3 : investor \? 5 : 10/);
  assert.match(table, /viewer, page, limit: pageSize/);
  assert.match(table, /visibleItems = items\.slice\(0, pageSize\)/);
  assert.match(full, /<IssuerPriceHistory \{\.\.\.props\} \/>/);
  assert.match(preview, /<IssuerPriceHistory\s+compact/);
  assert.equal(normalizePriceHistoryQuery({ page: 2, limit: 10 }).limit, 10);
  assert.equal(normalizePriceHistoryQuery({ page: 2, limit: 5 }).limit, 5);
});

test('issuer pagination reflects backend total and supports direct page selection', () => {
  const result = normalizePriceHistoryResponse({
    data: Array.from({ length: 10 }, (_, i) => ({ priceUpdateUid: `issuer-${i}` })),
    meta: { pagination: { page: 2, limit: 10, total: 24, totalPages: 3 } },
  });
  assert.equal(result.items.length, 10);
  assert.deepEqual(result.pagination, { page: 2, limit: 10, total: 24, totalPages: 3 });
  const table = read('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(table, /const visiblePages = !compact && totalPages > 1/);
  assert.match(table, /Showing \${firstRecord}–\${lastRecord} of \${totalRecords} updates/);
  assert.match(table, /Page \{currentPage\} of \{totalPages\}/);
  assert.match(table, /aria-current=\{page === number \? 'page' : undefined\}/);
  assert.match(table, /onClick=\{\(\) => setPage\(number\)\}/);
  assert.match(table, /disabled=\{page <= 1 \|\| query\.isFetching\}/);
  assert.match(table, /disabled=\{page >= totalPages \|\| query\.isFetching\}/);
  assert.match(table, /totalPages > 0 && page > totalPages/);
  assert.match(table, /!compact && query\.enabled/);
});

test('issuer pagination reuses responsive and accessible investor page controls', () => {
  const css = read('../src/assets/styles/price-history.css');
  assert.match(css, /\.price-history-pagination__controls \{/);
  assert.match(css, /flex-wrap: wrap/);
  assert.match(css, /\.price-history-pagination__page:focus-visible/);
  assert.match(css, /@media \(max-width: 680px\)/);
});
