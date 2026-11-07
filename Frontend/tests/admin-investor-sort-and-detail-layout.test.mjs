import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortAdminInvestorPage, sortAdminInvestorChainPage, investorInitials } from '../src/utils/adminInvestorSort.js';
import { restoreMonitoringFilters } from '../src/pages/admin/adminMonitoringFilters.js';
const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
const listing = read('pages/admin/AdminMonitoringListsPage.jsx');
const detail = read('pages/admin/AdminInvestorDetailPage.jsx');
const heading = read('components/admin/AdminTableSortHeading.jsx');
const pill = read('components/admin/AdminAddressPill.jsx');
const parts = read('components/admin/AdminMonitoringParts.jsx');

test('investor name, verification, profile and account sort each currently loaded page without modifying it', () => {
  const records = [
    { fullName: 'Zara Webb', emailVerified: true, profileStatus: 'Submitted', isActive: true },
    { fullName: 'Amy Lee', emailVerified: false, profileStatus: 'Draft', isActive: false },
    { fullName: 'Bill Jones', emailVerified: true, profileStatus: 'Not started', isActive: true },
  ];
  assert.deepEqual(sortAdminInvestorPage(records, 'investor', 'asc').map((r) => r.fullName), ['Amy Lee', 'Bill Jones', 'Zara Webb']);
  assert.deepEqual(sortAdminInvestorPage(records, 'investor', 'desc').map((r) => r.fullName), ['Zara Webb', 'Bill Jones', 'Amy Lee']);
  assert.equal(sortAdminInvestorPage(records, 'emailVerified', 'asc')[0].fullName, 'Amy Lee');
  assert.equal(sortAdminInvestorPage(records, 'profileStatus', 'asc')[0].fullName, 'Amy Lee');
  assert.equal(sortAdminInvestorPage(records, 'isActive', 'asc')[0].fullName, 'Zara Webb' /* Active sorts before Inactive */);
  assert.equal(records[0].fullName, 'Zara Webb');
  assert.strictEqual(sortAdminInvestorPage(records), records);
  assert.equal(investorInitials('Kane House'), 'KH');
  assert.equal(investorInitials('Kane'), 'KA');
});

test('network sort handles labels, status, unlock state and real timestamps', () => {
  const rows = [
    { chainName: 'ROBINHOOD', status: 'CREATED', isUnlocked: true, unlockedAt: '2026-10-14T15:30:00Z' },
    { chainName: 'ARC', status: 'LOCKED', isUnlocked: false, unlockedAt: null },
    { chainName: 'Ethereum', status: 'PENDING', isUnlocked: true, unlockedAt: '2026-10-13T15:30:00Z' },
  ];
  assert.deepEqual(sortAdminInvestorChainPage(rows, 'chainName', 'asc').map((r) => r.chainName), ['ARC', 'Ethereum', 'ROBINHOOD']);
  assert.equal(sortAdminInvestorChainPage(rows, 'status', 'asc')[0].status, 'CREATED');
  assert.equal(sortAdminInvestorChainPage(rows, 'isUnlocked', 'asc')[0].isUnlocked, false);
  assert.deepEqual(sortAdminInvestorChainPage(rows, 'unlockedAt', 'asc').map((r) => r.chainName), ['Ethereum', 'ROBINHOOD', 'ARC']);
  assert.deepEqual(sortAdminInvestorChainPage(rows, 'unlockedAt', 'desc').map((r) => r.chainName), ['ROBINHOOD', 'Ethereum', 'ARC']);
  assert.equal(rows[0].chainName, 'ROBINHOOD');
});

test('investor list has four sorter controls and the dark initial-avatar link', () => {
  for (const label of ['Investor', 'Email verified', 'Profile', 'Account']) {
    assert.ok(listing.includes(`label="${label}" field=`));
  }
  assert.match(listing, /sortAdminInvestorPage\(rows, sortBy, sortOrder\)/);
  assert.match(listing, /getInvestorColumns\(sortBy, sortOrder, onInvestorSort, filters\)/);
  assert.match(listing, /text-slate-950 transition-colors hover:text-blue-700/);
  assert.match(listing, /investorInitials\(name\)/);
  assert.match(listing, /AdminAddressPill value=\{r.walletAddress\}/);
  assert.match(listing, /kind === 'investors' \? investorRows/);
  assert.match(listing, /kind === 'tokens' \|\| kind === 'applications'/); // Do not pass unsupported investor sort fields to API
  assert.match(heading, /ArrowUpDown/);
  assert.match(parts, /aria-sort=\{col.sortDirection/);
});

test('investor detail retains detail tabs, uses circular header and network sort and copy controls', () => {
  assert.match(detail, /rounded-full bg-gradient-to-br/);
  assert.match(detail, /investorInitials\(displayName\)/);
  assert.match(detail, /Read-only profile and multi-network activity/);
  assert.match(detail, /\{backLabel\}/);
  assert.match(detail, /useLayoutEffect\(\(\) => \{ window.scrollTo/);
  assert.match(detail, /sortAdminInvestorChainPage/);
  for (const field of ["chain: 'chainName'", "status: 'status'", "unlocked: 'isUnlocked'", "date: 'unlockedAt'"]) assert.ok(detail.includes(field));
  assert.match(detail, /AdminAddressPill value=\{r.identityAddress\}/);
  assert.match(detail, /AdminAddressPill value=\{r.walletAddress\}/);
  assert.match(pill, /CompactAddress value=\{value\}/);
  assert.match(detail, /\[--text-soft:#0f172a\]/);
  for (const action of ['listInvestorChains', 'listInvestorTokens', 'listInvestorApplications']) assert.ok(detail.includes(`adminMonitoringApi.${action}(userUid, params)`));
});

test('back navigation can restore investor search, filters, page and local sorting', () => {
  const current = { page: 4, search: 'kane', status: 'submitted', chainUid: 'arc', sortBy: 'investor', sortOrder: 'desc' };
  assert.deepEqual(restoreMonitoringFilters('investors', current).investors, current);
  assert.match(listing, /monitoringFilters: \{ \.\.\.filters \}/);
  assert.match(detail, /state=\{location.state\?\.monitoringFilters/);
});
