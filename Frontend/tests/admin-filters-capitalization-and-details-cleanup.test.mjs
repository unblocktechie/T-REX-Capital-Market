import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const parts = read('src/components/admin/AdminMonitoringParts.jsx');
const lists = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const details = read('src/pages/admin/AdminInvestorDetailPage.jsx');

const formattingSource = parts.slice(parts.indexOf('const friendlyStates'), parts.indexOf('export function StateChip'))
  .replace(/export const /g, 'const ');
const labelFn = vm.runInNewContext(`${formattingSource}\ncapitalizeStatusOption;`);

test('admin status filter options are capitalized, but API values stay unchanged', () => {
  assert.equal(labelFn('draft'), 'Draft');
  assert.equal(labelFn('pending'), 'Pending');
  assert.equal(labelFn('deploying'), 'Deploying');
  assert.equal(labelFn('verified'), 'Verified');
  assert.equal(labelFn('Profile not started'), 'Profile not started');
  assert.equal(labelFn('submitIntrest'), 'Awaiting issuer review');
  assert.match(parts, /options=\{\[\{ value: 'all', label: 'All statuses' \}, \.\.\.statuses\.map/);
  assert.match(parts, /\{ \.\.\.option, label: capitalizeStatusOption\(option\.label \?\? option\.value\) \}/);
  assert.match(parts, /value=\{status\}/);
});

test('every monitoring list offers a one-click reset for search, status and network', () => {
  assert.match(parts, /Clear filters/);
  assert.match(parts, /disabled=\{!hasFilters\}/);
  assert.match(parts, /onClick=\{onClear\}/);
  assert.match(lists, /const hasFilters = Boolean\(search\.trim\(\) \|\| status !== 'all' \|\| chainUid\)/);
  assert.match(lists, /const clearFilters = \(\) => onFiltersChange\(\{ \.\.\.DEFAULT_MONITORING_FILTERS, sortBy: '', sortOrder: 'asc' \}\)/);
  assert.match(lists, /onClear=\{clearFilters\} hasFilters=\{hasFilters \|\| hasSortFilter\}/);
  assert.match(lists, /onRefresh=\{\(\) => query\.refetch\(\)\}/);
});

test('investor detail has no search or filter controls on any tab, and refresh is in tab header', () => {
  assert.match(details, /Object\.entries\(TAB_META\)\.map/);
  assert.match(details, /role="tablist"/);
  assert.match(details, /sm:justify-between/);
  assert.match(details, /onClick=\{\(\) => tabQuery\.refetch\(\)\}/);
  assert.doesNotMatch(details, /Search activity|Filter by status|Filter by network|<select/);
  // Investor activity itself still has no network filter; the token-details popup
  // separately uses the chain directory to resolve the token's explorer.
  assert.doesNotMatch(details, /useDebounce|Filter by network/);
  assert.match(details, /enabled: Boolean\(selectedTokenUid\)/);
  assert.match(details, /useMemo\(\(\) => \(\{ page, limit: 10 \}\), \[page\]\)/);
  assert.match(details, /const changeTab = \(next\) => \{ setSelectedTokenUid\(null\); setSelectedInterestUid\(null\); setSelectedApplication\(null\); setTab\(next\); setPage\(1\); \}/);
  assert.match(details, /<MonitoringTable columns=\{tab === 'applications' \? applicationColumns : tab === 'investedTokens' \? investedTokenColumns : chainColumns\}/);
});
