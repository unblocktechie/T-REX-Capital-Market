import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { formatAdminTokenPrice } from '../src/utils/adminTokenDisplay.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lists = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const detail = read('src/pages/admin/AdminInvestorDetailPage.jsx');
const parts = read('src/components/admin/AdminMonitoringParts.jsx');
const tooltip = read('src/components/common/ResponsiveTooltip.jsx');

const statusHelpers = parts.slice(parts.indexOf('const friendlyStates'), parts.indexOf('export function StateChip'))
  .replace(/export const /g, 'const ');
const capitalizeStatusOption = vm.runInNewContext(`${statusHelpers}\ncapitalizeStatusOption;`);

test('investor profile labels display capitalized values without changing status codes', () => {
  assert.equal(capitalizeStatusOption('submitted'), 'Submitted');
  assert.equal(capitalizeStatusOption('draft'), 'Draft');
  assert.equal(capitalizeStatusOption('notStarted'), 'Not started');
  assert.equal(capitalizeStatusOption('verifiedByIssuer'), 'Issuer verified');
  assert.match(lists, /profileStatus:.*|key: 'profileStatus'/);
  assert.match(lists, /<StateChip value=\{profileStatus\} label=\{capitalizeStatusOption\(profileStatus\)\}/);
});

test('investor application tab has only one capitalized stage badge and no notes column', () => {
  const apps = detail.slice(detail.indexOf('  applications: [', detail.indexOf('const cols')), detail.indexOf('  ],', detail.indexOf('  applications: [', detail.indexOf('const cols'))) + 4);
  assert.match(apps, /title: 'Stage'/);
  assert.match(apps, /<StateChip value=\{r.status\} label=\{capitalizeStatusOption\(r.status\)\}/);
  assert.doesNotMatch(apps, /display\(r.stage\)|r\.stage/);
  assert.doesNotMatch(apps, /title: 'Notes'|rejectReason|r\.note/);
  assert.match(detail, /adminMonitoringApi\.listInvestorApplications\(userUid, params\)/);
});

test('invested-token current price uses precise decimal rounding and accessible full-value tooltip', () => {
  assert.match(detail, /title: 'Current price', render: \(r\) => <InvestedTokenPrice value=\{r.currentTokenPrice\}/);
  assert.match(detail, /<PriceValue value=\{value\}/);
  assert.match(tooltip, /onMouseEnter=\{enabled \? showTooltip/);
  assert.match(tooltip, /onFocus=\{enabled \? showTooltip/);
  assert.equal(formatAdminTokenPrice('489.890000000000000000'), '489.89');
  assert.equal(formatAdminTokenPrice('7.000000000000000000'), '7.00');
  assert.equal(formatAdminTokenPrice('0.129999999999999999'), '0.13');
  assert.equal(formatAdminTokenPrice(null), '—');
});

test('invested tokens table displays only token, issuer, network, and current price columns', () => {
  const start = detail.indexOf('  investedTokens: [', detail.indexOf('const cols'));
  const end = detail.indexOf('  ],', start);
  const investedColumns = detail.slice(start, end);
  for (const heading of ['Token', 'Issuer', 'Network', 'Current price']) {
    assert.match(investedColumns, new RegExp(`title: '${heading}'`));
  }
  assert.doesNotMatch(investedColumns, /title: 'Token status'|key: 'status'/);
  assert.match(detail, /<MonitoringTable columns=\{tab === 'applications' \? applicationColumns : tab === 'investedTokens' \? investedTokenColumns : chainColumns\}/);
});

test('investor details keeps responsive table, network and invested token functionality', () => {
  assert.match(detail, /<MonitoringTable columns=\{tab === 'applications' \? applicationColumns : tab === 'investedTokens' \? investedTokenColumns : chainColumns\}/);
  assert.match(parts, /overflow-x-auto/);
  for (const action of ['listInvestorChains', 'listInvestorTokens', 'listInvestorApplications']) {
    assert.ok(detail.includes(`adminMonitoringApi.${action}(userUid, params)`));
  }
  assert.match(detail, /onClick=\{\(\) => tabQuery.refetch\(\)\}/);
});
