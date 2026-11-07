import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const routes = read('src/config/routes.js');
const router = read('src/routes/router.jsx');
const nav = read('src/layouts/admin/admin.navigation.js');
const api = read('src/api/admin/adminMonitoring.api.js');
const lists = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const details = read('src/pages/admin/AdminInvestorDetailPage.jsx');
const settings = read('src/pages/admin/AdminTeamNotificationsPage.jsx');
const parts = read('src/components/admin/AdminMonitoringParts.jsx');

const paramsSource = api.slice(api.indexOf('export const ADMIN_MONITORING_FILTERS'), api.indexOf('const unpack'))
  .replace(/export const /g, 'const ');
const monitoringListParams = vm.runInNewContext(`${paramsSource}\nmonitoringListParams;`);
const parseSource = settings.slice(settings.indexOf('export const parseTeamEmails'), settings.indexOf('export default function'))
  .replace('export const ', 'const ');
const parseTeamEmails = vm.runInNewContext(`const MAX_RECIPIENTS=20; const ADDRESS=/^[^\\s@,;]+@[^\\s@,;.]+(?:\\.[^\\s@,;.]+)+$/;\n${parseSource}\nparseTeamEmails;`);

test('admin routes are protected by existing admin role middleware', () => {
  assert.match(router, /<RoleMiddleware roles=\{\[ROLES\.admin\]\}/);
  for (const route of ['team-notifications', 'investors', 'investors/:userUid', 'tokens', 'investor-applications']) {
    assert.ok(router.includes(`path: '${route}'`));
  }
  for (const name of ['adminTeamNotifications', 'adminInvestors', 'adminInvestor:', 'adminTokens', 'adminInvestorApplications']) {
    assert.ok(routes.includes(name));
  }
  for (const title of ['Team Notifications', 'Investors', 'Tokens', 'Investor Applications']) {
    assert.ok(nav.includes(title));
  }
});

test('monitoring API keeps admin header isolation, correct UID, and server pagination', () => {
  assert.match(api, /skipSelectedChainHeader: true/);
  assert.match(api, /encodeURIComponent\(userUid\)/);
  assert.match(api, /meta\?\.pagination/);
  for (const endpoint of ['/investors', '/chains', '/invested-tokens', '/applications', '/tokens', '/investor-applications', '/notification-settings']) {
    assert.ok(api.includes(endpoint));
  }
  assert.match(api, /\{ teamNotificationEmails \}/);
});

test('admin endpoint filters are scoped, capped, and trim search', () => {
  const investor = monitoringListParams('investors', { page: -3, limit: 400, status: 'notStarted', chainUid: ' chain1 ', pendingOnly: true, organizationUid: 'org' });
  assert.equal(investor.page, 1);
  assert.equal(investor.limit, 100);
  assert.equal(investor.status, 'notStarted');
  assert.equal(investor.chainUid, 'chain1');
  assert.equal(investor.pendingOnly, undefined);
  assert.equal(investor.organizationUid, undefined);
  assert.equal(monitoringListParams('tokens', { page: 3, limit: 20, search: ' test ', status: 'all', organizationUid: 'org1' }).status, undefined);
  assert.equal(monitoringListParams('tokens', { page: 3, limit: 20, search: ' test ', status: 'all', organizationUid: 'org1' }).search, 'test');
  assert.equal(monitoringListParams('investors', { search: 'a'.repeat(250) }).search.length, 100);
  assert.equal(monitoringListParams('applications', { pendingOnly: true, status: 'rejected' }).pendingOnly, undefined);
  assert.equal(monitoringListParams('applications', { pendingOnly: true, status: 'all' }).pendingOnly, true);
  assert.equal(monitoringListParams('applications', { pendingOnly: true, status: 'submitIntrest' }).pendingOnly, true);
});

test('verification recipients normalize and validate with empty pause permitted', () => {
  const normalized = parseTeamEmails(' TEAM@Example.com, team@example.com\nother@example.org ');
  assert.deepEqual(Array.from(normalized.emails), ['team@example.com', 'other@example.org']);
  assert.equal(normalized.duplicates, 1);
  assert.equal(normalized.invalid.length, 0);
  assert.equal(normalized.tooMany, false);
  assert.equal(parseTeamEmails('').emails.length, 0);
  assert.equal(parseTeamEmails('bad@@email').invalid.length, 1);
  assert.equal(parseTeamEmails(Array.from({ length: 21 }, (_, i) => `${i}@example.com`).join(',')).tooMany, true);
  assert.match(settings, /mutationFn: \(\) => adminMonitoringApi\.updateNotificationSettings\(parsed\.emails\)/);
});

test('pages display live states, streamlined investor tabs and responsive pagination', () => {
  assert.match(lists, /'notStarted'/);
  assert.match(lists, /status=|submitIntrest/);
  assert.match(lists, /adminMonitoringApi\.listInvestors/);
  assert.match(lists, /adminMonitoringApi\.listApplications/);
  assert.match(lists, /adminMonitoringApi\.listTokens/);
  assert.match(details, /adminMonitoringApi\.getInvestor\(userUid\)/);
  assert.match(details, /adminMonitoringApi\.listInvestorChains\(userUid/);
  assert.match(details, /adminMonitoringApi\.listInvestorTokens\(userUid/);
  assert.match(details, /adminMonitoringApi\.listInvestorApplications\(userUid/);
  assert.doesNotMatch(details, /Tokens stay listed after redemption or sale/);
  assert.match(parts, /overflow-x-auto/);
  assert.match(parts, /lg:flex-row/);
  assert.match(parts, /aria-current=\{p === page \? 'page' : undefined\}/);
});
