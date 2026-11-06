import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
const shared = read('components/admin/AdminOrganizationList.jsx');
const monitoring = read('components/admin/AdminMonitoringParts.jsx');

for (const page of ['pages/admin/ReviewQueuePage.jsx', 'pages/admin/AdminOrganizationsPage.jsx']) {
  test(`${page} matches investor filter/table panel layout`, () => {
    const content = read(page);
    assert.match(content, /<AdminPanel bodyClassName="p-4 sm:p-5">\s*<OrganizationFilters/);
    assert.match(content, /<AdminPanel bodyClassName="p-3 sm:p-5">/);
    assert.match(content, /<AdminOrganizationList/);
    assert.doesNotMatch(content, /title="Organization applications"|title="Organization directory"|Secure review queue|Issuer entities/);
    assert.match(content, /<MonitoringPagination pagination=\{pagination\} onChange=\{setPage\} pending=/);
    assert.match(content, /limit: meta\.pageSize, total: meta\.total, totalPages: meta\.totalPages/);
    assert.match(content, /setPage\(1\)/);
    assert.match(content, /onRefresh=\{\(\) => \w+\.refetch\(\)\}/);
  });
}

test('shared organization filters are responsive and preserve one search, status and reset', () => {
  assert.equal((shared.match(/type="search"/g) || []).length, 1);
  assert.match(shared, /sm:grid-cols-2 xl:grid-cols-/);
  assert.match(shared, /<MarketplaceDropdown/);
  assert.match(shared, /onChange=\{onStatusChange\}/);
  assert.match(shared, /Clear filters/);
  assert.match(shared, /Refresh/);
  assert.match(shared, /onClick=\{\(\) => onSortChange\(field\)\}/);
  assert.match(shared, /overflow-x-auto/);
});

test('organization pagination is exactly the existing numbered investor pagination', () => {
  assert.match(monitoring, /export function MonitoringPagination/);
  assert.match(monitoring, /Showing \{start\}–\{end\} of \{total\} records/);
  assert.match(monitoring, /aria-current=\{p === page \? 'page' : undefined\}/);
  assert.match(monitoring, /aria-label="Previous page"/);
  assert.match(monitoring, /aria-label="Next page"/);
  assert.match(monitoring, /disabled=\{pending \|\| page >= totalPages\}/);
});
