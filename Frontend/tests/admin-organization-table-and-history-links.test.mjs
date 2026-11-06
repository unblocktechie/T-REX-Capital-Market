import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const organizations = read('components/admin/AdminOrganizationList.jsx');
const monitoring = read('pages/admin/AdminMonitoringListsPage.jsx');
const investorDetail = read('pages/admin/AdminInvestorDetailPage.jsx');
const dialog = read('components/admin/AdminMonitoringDetailDialogs.jsx');
const organizationDetail = read('pages/admin/OrganizationReviewPage.jsx');

test('both organization pages use a real responsive table, copyable full wallets and text view links', () => {
  assert.match(organizations, /<table className=/);
  assert.match(organizations, /overflow-x-auto/);
  assert.match(organizations, /<th scope="col"[^>]*>Organization wallet<\/th>/);
  assert.match(organizations, /CompactAddress value=\{organization\.wallet\.address\}/);
  assert.match(organizations, /View organization →/);
  assert.doesNotMatch(organizations, /<Eye /);
  for (const page of ['pages/admin/ReviewQueuePage.jsx', 'pages/admin/AdminOrganizationsPage.jsx']) {
    assert.match(read(page), /<AdminOrganizationList/);
  }
});

test('admin investors and invested token addresses use reusable copy control', () => {
  assert.match(monitoring, /AdminAddressPill value=\{r\.walletAddress\}/);
  assert.match(investorDetail, /AdminAddressPill value=\{r\.tokenAddress\}/);
  assert.match(investorDetail, /AdminAddressPill value=\{r\.walletAddress\}/);
  assert.match(read('components/admin/AdminAddressPill.jsx'), /CompactAddress value=\{value\}/);
  assert.match(investorDetail, /ROUTES\.adminOrganizationReview\(uid\)/);
  assert.match(investorDetail, /backState: \{ tab: sourceTab, page \}/);
  assert.match(organizationDetail, /state=\{location\.state\?\.backState\}/);
});

test('application timeline shows organization, omits resubmission card and filenames, retains secure preview', () => {
  assert.match(dialog, /history\.organizationName/);
  assert.doesNotMatch(dialog, />Resubmissions<\/dt>/);
  assert.doesNotMatch(dialog, /doc\.originalFileName\s*\?/);
  assert.doesNotMatch(dialog, /doc\.versionNumber\s*\?/);
  assert.match(dialog, /setActiveDocument\(doc\)/);
  assert.match(dialog, /target="_blank" rel="noopener noreferrer"/);
});

// Run the explorer helper in isolation so these tests need no installed frontend dependencies.
const explorerModule = read('utils/adminApplicationExplorer.js')
  .replace(/^import .*;\s*$/gm, '')
  .replace(/export const /g, 'const ');
const chainRecords = [
  { chainId: 421614, chainUid: 'arb-test', chainName: 'Arbitrum Sepolia', explorerUrl: 'https://sepolia.arbiscan.io' },
  { chainId: 46630, chainUid: 'robin-test', chainName: 'Robinhood Testnet', explorerUrl: 'https://wrong.invalid' },
];
const context = {
  URL, Number, String, Array, Object,
  getChainRecordById: (id) => chainRecords.find((r) => Number(r.chainId) === Number(id)),
  getChainRecordByUid: (uid) => chainRecords.find((r) => r.chainUid === uid),
  resolveChainExplorerUrl: (id, configured) => Number(id) === 46630 ? 'https://explorer.testnet.chain.robinhood.com' : configured,
  isValidTransactionHash: (hash) => /^0x[a-fA-F0-9]{64}$/.test(String(hash)),
};
const { getApplicationExplorerBase, getAdminApplicationTransactionUrl } = vm.runInNewContext(`${explorerModule}\n({getApplicationExplorerBase,getAdminApplicationTransactionUrl});`, context);
const hash = `0x${'a'.repeat(64)}`;

test('transaction link resolves from application chain, never an unrelated selected chain', () => {
  const explorer = getApplicationExplorerBase({ tokenName: 'Asset' }, { chainUid: 'arb-test' }, chainRecords);
  assert.equal(explorer, 'https://sepolia.arbiscan.io');
  assert.equal(getAdminApplicationTransactionUrl(hash, explorer), `https://sepolia.arbiscan.io/tx/${hash}`);
  assert.equal(getApplicationExplorerBase({}, {}, chainRecords), '');
  assert.equal(getApplicationExplorerBase({}, { chainId: 46630 }, chainRecords), 'https://explorer.testnet.chain.robinhood.com');
});

test('explorer URL rejects invalid hash and non-web explorer URL', () => {
  assert.equal(getAdminApplicationTransactionUrl('0x123', 'https://sepolia.arbiscan.io'), '');
  assert.equal(getAdminApplicationTransactionUrl(hash, 'javascript:alert(1)'), '');
  assert.equal(getAdminApplicationTransactionUrl(hash, 'https://username:password@evil.invalid'), '');
});
