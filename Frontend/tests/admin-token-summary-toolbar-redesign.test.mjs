import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const modal = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const history = read('src/components/admin/AdminTokenPriceHistory.jsx');
const list = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const chart = history.slice(history.indexOf('function AdminHistoryChart'), history.indexOf('function AdminHistoryTable'));
const tabs = history.slice(history.indexOf('export function AdminTokenPriceHistory'));

test('the investor table displays Title Case column names instead of uppercase', () => {
  assert.match(modal, /modalSortHeading\('Current balance'/);
  assert.match(modal, /modalSortHeading\('Holding status'/);
  assert.match(modal, /modalSortHeading\('Investor'/);
  assert.doesNotMatch(modal, /<thead className="[^"]*uppercase/);
});

test('Platform Tokens headings render uppercase and retain backend sort buttons', () => {
  assert.match(list, /\{label\.toUpperCase\(\)\}/);
  assert.match(list, /title: <span className="font-semibold text-slate-500">INVESTORS<\/span>/);
  assert.match(list, /onClick=\{\(\) => onSort\(key\)\}/);
  assert.match(list, /'tokenName', sortBy, sortOrder/);
});

test('price-history controls share one row and the annotated legend and count are removed', () => {
  assert.match(tabs, /price-history-chart__toolbar admin-history-controls/);
  assert.match(tabs, /PRICE_GRAPH_RANGES\.map/);
  assert.match(tabs, /aria-label="Price history view"/);
  assert.match(tabs, /view === 'chart'/);
  assert.match(chart, /priceHistoryGraphRows\(items, months\)/);
  assert.doesNotMatch(chart, /price-history-chart__legend|price-history-chart__count/);
  assert.match(tabs, /getTokenPriceHistory\(tokenUid/);
});

test('summary and chart toolbar stay responsive', () => {
  const css = read('src/assets/styles/price-history.css');
  assert.match(css, /price-history-panel--admin \.admin-history-controls/);
  assert.match(css, /max-width: 560px/);
  assert.match(modal, /sm:max-w-\[1200px\]/);
  assert.match(modal, /sm:grid-cols-2 lg:grid-cols-4/);
});
