import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lists = readFileSync(new URL('../src/pages/admin/AdminMonitoringListsPage.jsx', import.meta.url), 'utf8');
const statusList = lists.match(/const TOKEN_STATUSES = \[([^\]]+)\]\.map/)?.[1] || '';

test('Platform Tokens offers only the allowed status filters', () => {
  assert.deepEqual([...statusList.matchAll(/'([^']+)'/g)].map((match) => match[1]), ['draft', 'deployed', 'failed']);
  assert.match(lists, /kind === 'tokens' \? TOKEN_STATUSES/);
});

test('Investor Applications removes review-only checkbox and its query state', () => {
  assert.doesNotMatch(lists, /pendingOnly|setPendingOnly|Awaiting issuer review only|type="checkbox"/);
  assert.match(lists, /submitIntrest/); // Standard Awaiting issuer review status remains available.
  assert.match(lists, /adminMonitoringApi\.listApplications\(params\)/);
});

test('Search, normal statuses, network, refresh, clear filters and pagination remain', () => {
  assert.match(lists, /<ListTools search=\{search\}/);
  assert.match(lists, /const clearFilters = \(\) =>/);
  assert.match(lists, /onRefresh=\{\(\) => query\.refetch\(\)\}/);
  assert.match(lists, /onPageChange=\{setPage\}/);
});
