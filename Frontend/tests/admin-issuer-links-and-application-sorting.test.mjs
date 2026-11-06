import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolveAdminIssuerOrganizationUid } from '../src/utils/adminIssuerNavigation.js';
import { sortAdminApplicationPage } from '../src/utils/adminApplicationSort.js';
import { createMonitoringFilterState, restoreMonitoringFilters } from '../src/pages/admin/adminMonitoringFilters.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const listing = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const orgDetail = read('src/pages/admin/OrganizationReviewPage.jsx');
const api = read('src/api/admin/adminMonitoring.api.js');
const monitoringListParams = vm.runInNewContext(`${api.slice(api.indexOf('export const ADMIN_MONITORING_FILTERS'), api.indexOf('const unpack')).replaceAll('export const ', 'const ')}\nmonitoringListParams;`);

test('issuer links only use organization IDs, and name-only fallback is unambiguous', () => {
  const organizations = [
    { id: 'org-1', name: 'Company A' },
    { id: 'org-2', name: 'Company B' },
  ];
  assert.equal(resolveAdminIssuerOrganizationUid({ organizationUid: 'org-3', issuerName: 'Different' }, organizations), 'org-3');
  assert.equal(resolveAdminIssuerOrganizationUid({ issuer: { organizationUid: 'org-4' } }, organizations), 'org-4');
  assert.equal(resolveAdminIssuerOrganizationUid({ issuerUid: 'user-1', issuerName: 'Company A' }, organizations), 'org-1');
  assert.equal(resolveAdminIssuerOrganizationUid({ issuerName: ' company b ' }, organizations), 'org-2');
  assert.equal(resolveAdminIssuerOrganizationUid({ issuerName: 'Unknown' }, organizations), '');
  assert.equal(resolveAdminIssuerOrganizationUid({ issuerName: 'Company A' }, [...organizations, { id: 'org-5', name: 'company a' }]), '');
});

test('both issuer columns link only the issuer name and preserve source view state', () => {
  assert.match(listing, /key: 'issuer'.*render: \(r\) => renderIssuer\(r, r\.legalCompanyName\)/);
  assert.match(listing, /key: 'issuer', title: applicationSortHeading\('Issuer', 'issuerName'/);
  assert.match(listing, /key: 'token', title: applicationSortHeading\('Token', 'tokenName'/);
  assert.match(listing, /getApplicationTokenLabel\(r, r\)/);
  assert.match(listing, /renderIssuer\(r, r\.issuerName \|\| r\.legalCompanyName \|\| r\.organizationName\)/);
  assert.match(listing, /ROUTES\.adminOrganizationReview\(encodeURIComponent\(uid\)\)/);
  assert.match(listing, /state=\{\{ from: location\.pathname, backState: \{ monitoringFilters: \{ \.\.\.filters \} \} \}\}/);
  assert.match(orgDetail, /requestedBack === ROUTES\.adminTokens/);
  assert.match(orgDetail, /requestedBack === ROUTES\.adminInvestorApplications/);
  assert.match(orgDetail, /Back to platform tokens/);
  assert.match(orgDetail, /Back to investor applications/);
  assert.match(orgDetail, /state=\{location\.state\?\.backState\}/);
});

test('return navigation restores search, status, network, sorting and pagination', () => {
  const saved = { search: 'Alice', status: 'registered', chainUid: 'chain-2', sortBy: 'submittedAt', sortOrder: 'desc', page: 3 };
  assert.deepEqual(restoreMonitoringFilters('applications', saved).applications, saved);
  assert.equal(restoreMonitoringFilters('tokens', { ...saved, page: -8 }).tokens.page, 1);
  assert.deepEqual(restoreMonitoringFilters('investors', saved).investors, saved);
});

test('application sorts are whitelisted and sort visible records without modifying source', () => {
  assert.equal(monitoringListParams('applications', { sortBy: 'submittedAt', sortOrder: 'desc' }).sortOrder, 'desc');
  assert.equal(monitoringListParams('applications', { sortBy: 'investorName', sortOrder: 'asc' }).sortBy, 'investorName');
  assert.equal(monitoringListParams('applications', { sortBy: 'badKey' }).sortBy, undefined);
  const rows = [
    { investorName: 'Test 10', tokenName: 'C', status: 'registered', submittedAt: '2026-10-14T08:00:00Z' },
    { investorName: 'Test 2', tokenName: 'A', status: 'pending', submittedAt: '2026-10-16T08:00:00Z' },
    { investorName: 'Test 1', tokenName: 'B', status: 'submitted', submittedAt: '2026-10-15T08:00:00Z' },
  ];
  assert.deepEqual(sortAdminApplicationPage(rows, 'investorName').map((r) => r.investorName), ['Test 1', 'Test 2', 'Test 10']);
  assert.deepEqual(sortAdminApplicationPage(rows, 'submittedAt', 'desc').map((r) => r.investorName), ['Test 2', 'Test 1', 'Test 10']);
  assert.equal(rows[0].investorName, 'Test 10');
  assert.equal(sortAdminApplicationPage(rows, 'unrecognized'), rows);
  assert.match(listing, /const onApplicationSort = useCallback/);
  assert.match(listing, /sortOrder: sortBy === key && sortOrder === 'asc' \? 'desc' : 'asc', page: 1/);
});

test('sortable headers on both tables match the Investor Accounts font weight and color', () => {
  const parts = read('src/components/admin/AdminMonitoringParts.jsx');
  assert.match(parts, /thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"/);
  assert.match(listing, /const sortableHeaderClass = '[^']*font-semibold text-slate-500[^']*'/);
  assert.match(listing, /tokenSortHeading = .*?<button/s);
  assert.match(listing, /const tokenSortHeading = [\s\S]*?className=\{sortableHeaderClass\}/);
  assert.match(listing, /const applicationSortHeading = [\s\S]*?className=\{sortableHeaderClass\}/);
  assert.match(listing, /title: <span className="font-semibold text-slate-500">INVESTORS<\/span>/);
  assert.match(listing, /key: 'history', title: 'HISTORY'/);
  assert.doesNotMatch(listing, /font-bold text-slate-700 hover:text-blue-700/);
});

test('issuer sorting stays on the loaded page without forwarding unsupported backend sort keys', () => {
  const rows = [
    {issuerName: 'Zeta LLC', tokenName: 'Apple'},
    {issuerName: 'Alpha LLC', tokenName: 'Zebra'},
    {issuerName: 'Beta LLC', tokenName: 'Pear'},
  ];
  assert.deepEqual(sortAdminApplicationPage(rows, 'issuerName').map(row => row.issuerName), ['Alpha LLC', 'Beta LLC', 'Zeta LLC']);
  assert.deepEqual(sortAdminApplicationPage(rows, 'issuerName', 'desc').map(row => row.issuerName), ['Zeta LLC', 'Beta LLC', 'Alpha LLC']);
  assert.equal(monitoringListParams('applications', {sortBy: 'issuerName', sortOrder: 'desc'}).sortBy, undefined);
  assert.equal(rows[0].issuerName, 'Zeta LLC');
});

test('Investor Applications has a circular avatar, separate issuer and token, and reuses token modal', () => {
  const positions = ["key: 'investor'", "key: 'issuer'", "key: 'token'", "key: 'chain'"]
    .map(term => listing.indexOf(term, listing.indexOf('const getApplicationColumns')));
  assert.ok(positions.every(position => position >= 0));
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]));
  assert.match(listing, /rounded-full bg-gradient-to-br from-slate-950 to-slate-700/);
  assert.match(listing, /onClick=\{\(\) => onViewToken\(r\)\}/);
  assert.match(listing, /getApplicationTokenLabel\(r, r\)/);
  assert.match(listing, /kind === 'tokens' \|\| kind === 'applications'\) && <AdminTokenDetailsDialog/);
  assert.match(listing, /adminMonitoringApi\.getApplicationHistory\(application\.interestUid\)/);
});

test('admin workspace gives navigational links and active controls pointer cursor, including portal dialogs', () => {
  const style = read('src/assets/styles/admin-table-typography.css');
  assert.match(style, /body:has\(\.trex-admin-workspace\)/);
  assert.match(style, /a\[href\], button:not\(:disabled\)/);
  assert.match(style, /cursor: pointer;/);
  assert.match(style, /button:disabled/);
});
