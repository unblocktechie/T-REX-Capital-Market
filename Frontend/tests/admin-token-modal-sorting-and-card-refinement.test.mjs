import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortAdminTokenInvestorsPage, sortAdminTokenHistoryPage } from '../src/utils/adminTokenModalSort.js';

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const detail = file('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const history = file('src/components/admin/AdminTokenPriceHistory.jsx');
const listing = file('src/pages/admin/AdminMonitoringListsPage.jsx');

test('investor sorting is stable, uses exact decimal comparison and does not mutate fetched records', () => {
  const rows = [
    { investorName: 'Zane', accreditationType: 'Individual', currentTokenBalance: '1000000000000000000.1', holderStatus: 'FORMER' },
    { investorName: 'Amy', accreditationType: 'Company', currentTokenBalance: '1000000000000000000.0000000001', holderStatus: 'CURRENT' },
    { investorName: 'Kane', accreditationType: 'Individual', currentTokenBalance: '3', holderStatus: 'CURRENT' },
  ];
  const initial = rows.slice();
  assert.deepEqual(sortAdminTokenInvestorsPage(rows, 'investor').map((r) => r.investorName), ['Amy', 'Kane', 'Zane']);
  assert.deepEqual(sortAdminTokenInvestorsPage(rows, 'balance', 'desc').map((r) => r.investorName), ['Zane', 'Amy', 'Kane']);
  assert.deepEqual(sortAdminTokenInvestorsPage(rows, 'holdingStatus').map((r) => r.investorName), ['Amy', 'Kane', 'Zane']);
  assert.deepEqual(rows, initial);
  assert.equal(sortAdminTokenInvestorsPage(rows, 'unknown'), rows);
});

test('history sortable fields include dates, precise prices, method and status', () => {
  const rows = [
    { createdAt: '2026-10-22T10:00:00Z', oldPriceFormatted: '350.001', newPriceFormatted: '2.00000000000001', updateType: 'MANUAL', status: 'CONFIRMED' },
    { createdAt: '2026-10-23T10:00:00Z', oldPriceFormatted: '10.00', newPriceFormatted: '2.00000000000002', updateType: 'BOT', status: 'FAILED' },
  ];
  assert.equal(sortAdminTokenHistoryPage(rows, 'date', 'desc')[0], rows[1]);
  assert.equal(sortAdminTokenHistoryPage(rows, 'previousPrice')[0], rows[1]);
  assert.equal(sortAdminTokenHistoryPage(rows, 'newPrice', 'desc')[0], rows[1]);
  assert.equal(sortAdminTokenHistoryPage(rows, 'method')[0], rows[1]);
  assert.equal(sortAdminTokenHistoryPage(rows, 'status')[0], rows[0]);
  assert.equal(sortAdminTokenHistoryPage(rows, 'unknown'), rows);
});

test('platform token row styling, links and address pills match investor details', () => {
  assert.match(listing, /AdminAddressPill value={token.tokenAddress}/);
  assert.match(listing, /hover:text-blue-700/);
  assert.match(listing, /to={ROUTES.adminOrganizationReview/);
  assert.match(detail, /investorInitials\(investorName\(investor\)\)/);
  assert.match(detail, /<AdminAddressPill value={investor.walletAddress}/);
});

test('token overview keeps chain, deployed badge, copy-only contract and 4 summary panels', () => {
  assert.match(detail, /<StateChip value={token.status}/);
  assert.match(detail, /border-blue-200 bg-blue-100/);
  assert.match(detail, /<CompactAddress value={token.tokenAddress}/);
  assert.match(detail, /Invested investors/);
  assert.match(detail, /Deployed on/);
  assert.match(detail, /lg:grid-cols-4/);
  assert.match(detail, /tokenContractExplorer\(token, chains\)/);
  assert.match(detail, /resolveAdminIssuerOrganizationUid/);
  assert.match(detail, /onInvestorSort/);
});

test('history headings are interactive and do not change backend query sorting', () => {
  for (const key of ['date', 'previousPrice', 'newPrice', 'method', 'status']) {
    assert.match(history, new RegExp(`sortHeading\\([^)]*'${key}'\\)`));
  }
  assert.match(history, /sortedRecords\.map/);
  assert.match(history, /admin-history-mobile-sort/);
  assert.match(history, /sortAdminTokenHistoryPage/);
  assert.doesNotMatch(history, /sortBy:\s*sort\.field/);
});
