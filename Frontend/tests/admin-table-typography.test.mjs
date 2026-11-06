import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const stylesheet = read('src/assets/styles/admin-table-typography.css');

test('admin table headers share one font family, size, weight, color and uppercase style', () => {
  assert.match(stylesheet, /\.admin-data-table thead th\s*\{/);
  assert.match(stylesheet, /font-family:\s*var\(--font-body\)/);
  assert.match(stylesheet, /font-size:\s*12px/);
  assert.match(stylesheet, /font-weight:\s*700/);
  assert.match(stylesheet, /color:\s*#64748b/);
  assert.match(stylesheet, /text-transform:\s*uppercase/);
});

test('sorted and static column headings inherit the same typography', () => {
  assert.match(stylesheet, /\.admin-data-table thead th :is\(button, span\)/);
  for (const style of ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color']) {
    assert.match(stylesheet, new RegExp(`${style}:\\s*inherit`));
  }
  assert.match(read('src/pages/admin/AdminMonitoringListsPage.jsx'), /const sortableHeaderClass/);
  assert.match(read('src/pages/admin/AdminMonitoringListsPage.jsx'), /onClick=\{\(\) => onSort\(key\)\}/);
});

test('admin tables use the scoped typography without changing their layout', () => {
  for (const file of [
    'src/components/admin/AdminMonitoringParts.jsx',
    'src/components/admin/AdminOrganizationList.jsx',
    'src/components/admin/AdminMonitoringDetailDialogs.jsx',
    'src/pages/admin/AdminNetworksPage.jsx',
  ]) {
    assert.match(read(file), /<table className="admin-data-table\s/, file);
  }
  assert.match(read('src/layouts/admin/AdminLayout.jsx'), /trex-admin-workspace/);
  assert.match(read('src/layouts/admin/AdminLayout.jsx'), /admin-table-typography\.css/);
});

test('non-table grid headings in admin network, price history and API settings match', () => {
  assert.match(read('src/pages/admin/AdminNetworksPage.jsx'), /admin-grid-table-header/);
  assert.match(read('src/pages/admin/AdminIssuerApiKeySettingsPage.jsx'), /admin-grid-table-header/);
  assert.match(stylesheet, /\.price-history-panel--admin \.price-history-column-headings/);
  assert.match(stylesheet, /\.admin-grid-table-header/);
  assert.match(read('src/components/admin/AdminTokenPriceHistory.jsx'), /price-history-column-headings/);
});

test('styles are admin-scoped and do not globally modify investor/issuer table presentation', () => {
  assert.doesNotMatch(stylesheet, /^\s*(?:table|thead|th|button)\s*\{/m);
  assert.match(stylesheet, /\.trex-admin-workspace/);
  assert.match(stylesheet, /\.admin-data-table/);
  assert.doesNotMatch(stylesheet, /display:\s*(?:none|block|grid|flex)/);
  assert.doesNotMatch(stylesheet, /min-width:|padding:|overflow:/);
});
