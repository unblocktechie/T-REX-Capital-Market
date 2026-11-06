import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortAdminInvestorTokenPage, sortAdminInvestorApplicationPage } from '../src/utils/adminInvestorSort.js';
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const detail = read('pages/admin/AdminInvestorDetailPage.jsx');
const organizationTable = read('components/admin/AdminOrganizationList.jsx');
const stylesheet = read('assets/styles/global.css');

test('invested token sorts names, issuers, chains, and high-precision prices without mutating data', () => {
  const rows = [
    { tokenName: 'Zeta', legalCompanyName: 'Beta', chainName: 'ROBINHOOD', currentTokenPrice: '351.0000000000000001' },
    { tokenName: 'Alpha', legalCompanyName: 'Delta', chainName: 'ARC', currentTokenPrice: '1.00000000000000001' },
    { tokenName: 'Bravo', legalCompanyName: 'Alpha', chainName: 'Ethereum', currentTokenPrice: '351.0000000000000002' },
  ];
  assert.deepEqual(sortAdminInvestorTokenPage(rows, 'tokenName', 'asc').map((r) => r.tokenName), ['Alpha', 'Bravo', 'Zeta']);
  assert.deepEqual(sortAdminInvestorTokenPage(rows, 'issuerName', 'asc').map((r) => r.tokenName), ['Bravo', 'Zeta', 'Alpha']);
  assert.deepEqual(sortAdminInvestorTokenPage(rows, 'chainName', 'desc').map((r) => r.chainName), ['ROBINHOOD', 'Ethereum', 'ARC']);
  assert.deepEqual(sortAdminInvestorTokenPage(rows, 'currentTokenPrice', 'asc').map((r) => r.tokenName), ['Alpha', 'Zeta', 'Bravo']);
  assert.deepEqual(sortAdminInvestorTokenPage(rows, 'currentTokenPrice', 'desc').map((r) => r.tokenName), ['Bravo', 'Zeta', 'Alpha']);
  assert.strictEqual(sortAdminInvestorTokenPage(rows, 'notAnAllowedField'), rows);
  assert.equal(rows[0].tokenName, 'Zeta');
});

test('application sorts name, issuer, network, status, and actual dates with fallback timestamps', () => {
  const rows = [
    { tokenName: 'Zeta', issuerName: 'B Corp', chainName: 'ARBITRUM', status: 'Registered', submittedAt: '2026-10-14T14:00:00Z' },
    { tokenName: 'Alpha', issuerName: 'C Corp', chainName: 'ROBINHOOD', status: 'Pending', createdAt: '2026-10-12T14:00:00Z' },
    { tokenName: 'Beta', issuerName: 'A Corp', chainName: 'ARC', status: 'Completed', submittedAt: '2026-10-13T14:00:00Z' },
  ];
  assert.deepEqual(sortAdminInvestorApplicationPage(rows, 'tokenName', 'asc').map((r) => r.tokenName), ['Alpha', 'Beta', 'Zeta']);
  assert.deepEqual(sortAdminInvestorApplicationPage(rows, 'issuerName', 'asc').map((r) => r.tokenName), ['Beta', 'Zeta', 'Alpha']);
  assert.deepEqual(sortAdminInvestorApplicationPage(rows, 'chainName', 'asc').map((r) => r.tokenName), ['Zeta', 'Beta', 'Alpha']);
  assert.deepEqual(sortAdminInvestorApplicationPage(rows, 'status', 'asc').map((r) => r.tokenName), ['Beta', 'Alpha', 'Zeta']);
  assert.deepEqual(sortAdminInvestorApplicationPage(rows, 'submittedAt', 'desc').map((r) => r.tokenName), ['Zeta', 'Beta', 'Alpha']);
  assert.equal(rows[0].tokenName, 'Zeta');
});

test('investor detail columns and card layout match requested behavior', () => {
  assert.match(detail, /title: 'Token address', render: \(r\) => <AdminAddressPill value=\{r\.tokenAddress\}/);
  assert.match(detail, /tokenDisplayName\(r\)/);
  assert.match(detail, /const issuerDisplayName =/);
  assert.match(detail, /key: 'issuer', title: 'Issuer'/);
  assert.match(detail, /changeDetailSort/);
  assert.match(detail, /sortAdminInvestorTokenPage\(records, by, order\)/);
  assert.match(detail, /sortAdminInvestorApplicationPage\(records, by, order\)/);
  assert.match(detail, /text-slate-950 transition-colors hover:text-blue-700/);
  assert.match(detail, /state=\{\{ from: location\.pathname, backState: \{ tab: sourceTab, page \} \}\}/);
  assert.match(detail, /<CompactAddress value=\{value\} label=\{label\} showFull/);
  assert.match(detail, /admin-investor-detail-wallet/);
  assert.match(stylesheet, /\.admin-investor-detail-wallet \.compact-address \{/);
  assert.doesNotMatch(detail, /Tokens stay listed after redemption or sale/);
  assert.match(detail, /className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"/);
});

test('both organization and review queue tables share interactive directional icons', () => {
  assert.match(organizationTable, /<SortableOrganizationHeading label="Organization" field="name"/);
  assert.match(organizationTable, /<SortableOrganizationHeading label="Submitted" field="submittedAt"/);
  assert.match(organizationTable, /<SortableOrganizationHeading label="Status" field="status"/);
  for (const icon of ['ArrowUp', 'ArrowDown', 'ArrowUpDown']) assert.match(organizationTable, new RegExp(`<${icon} className=`));
  assert.match(organizationTable, /aria-sort=\{onSortChange/);
});
