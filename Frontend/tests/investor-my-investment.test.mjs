import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ROUTES } from '../src/config/routes.js';
import { MY_INVESTMENT_TABS, resolveMyInvestmentTab } from '../src/utils/investorMyInvestmentTabs.js';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('one investor sidebar entry and three deep-linkable tabs', async () => {
  const navigation = await read('../src/config/navigation.js');
  const investorGroup = navigation.slice(navigation.indexOf("label: 'Marketplace'"), navigation.indexOf("label: 'Manage Investments'"));
  assert.equal((investorGroup.match(/label: 'My Investment'/g) || []).length, 1);
  assert.doesNotMatch(investorGroup, /label: 'My Applications'|label: 'Invitations'|label: 'Portfolio'/);
  assert.deepEqual(MY_INVESTMENT_TABS.map(({ label }) => label), ['My Application', 'Portfolio', 'Invitation']);
  assert.equal(ROUTES.investorMyInvestment, '/app/my-investment');
  for (const { id } of MY_INVESTMENT_TABS) {
    assert.equal(resolveMyInvestmentTab(id), id);
    assert.equal(ROUTES.investorMyInvestmentTab(id), `/app/my-investment?tab=${id}`);
  }
  assert.equal(resolveMyInvestmentTab('unsupported'), 'my-application');
});

test('legacy list routes redirect preserving query and record routes are not changed', async () => {
  const routes = await read('../src/routes/router.jsx');
  assert.match(routes, /path: 'my-investment', element: withWorkspaceSuspense\(<InvestorMyInvestmentPage \/>\)/);
  for (const [path, tab] of [['applications', 'my-application'], ['portfolio', 'portfolio'], ['invitations', 'invitation']]) {
    assert.ok(routes.includes(`path: '${path}', element: <InvestorMyInvestmentLegacyRedirect tab="${tab}" />`));
  }
  assert.match(routes, /const params = new URLSearchParams\(location\.search\);/);
  assert.match(routes, /params\.set\('tab', tab\);/);
  assert.match(routes, /state=\{location\.state\}/);
  assert.match(routes, /path: 'applications\/:interestUid'/);
  assert.match(routes, /path: 'applications\/:interestUid\/redeem'/);
});

test('tab switching preserves independently mounted page state', async () => {
  const tabs = await read('../src/pages/investor-portal/InvestorMyInvestmentPage.jsx');
  assert.match(tabs, /new Set\(\[activeTab\]\)/);
  assert.match(tabs, /visitedTabs\.has\(tab\.id\) \|\| tab\.id === activeTab/);
  assert.match(tabs, /hidden=\{activeTab !== tab\.id\}/);
  assert.match(tabs, /<MyApplicationsPage embedded \/>/);
  assert.match(tabs, /<PortfolioPage embedded \/>/);
  assert.match(tabs, /<InvitationsPage embedded \/>/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{activeTab === tab\.id\}/);
  assert.match(tabs, /useSidebarActionIndicators\(ROLES\.investor\)/);
});

test('all tabs render five records per page without altering other app screens', async () => {
  const applications = await read('../src/pages/investor-portal/MyApplicationsPage.jsx');
  const portfolio = await read('../src/pages/investor-portal/PortfolioPage.jsx');
  const invitations = await read('../src/pages/investor-portal/InvitationsPage.jsx');
  for (const source of [applications, portfolio, invitations]) assert.match(source, /const PAGE_SIZE = 5;/);
  assert.match(applications, /filtered\.slice\(\(currentPage - 1\) \* PAGE_SIZE, currentPage \* PAGE_SIZE\)/);
  assert.match(applications, /rows=\{paginatedApplications\}/);
  assert.match(applications, /<InvestorHistoryPagination/);
  assert.match(portfolio, /limit: PAGE_SIZE/);
  assert.match(portfolio, /<InvestorHistoryPagination/);
  assert.match(invitations, /limit: PAGE_SIZE/);
  assert.match(invitations, /<InvestorHistoryPagination/);
  assert.match(applications, /placeholder="Search applications"/);
  assert.match(invitations, /placeholder="Search token, symbol or issuer company"/);
});

test('layout uses issuer tab styles, responsive scrolling, and one visible heading', async () => {
  const tabs = await read('../src/pages/investor-portal/InvestorMyInvestmentPage.jsx');
  const css = await read('../src/assets/styles/investor.css');
  assert.match(tabs, /issuer-investor-management__tabs/);
  assert.match(tabs, /issuer-investor-management__tab-icon/);
  assert.match(css, /\.issuer-investor-management__tabs\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.issuer-investor-management__tab\.is-active\s*\{[^}]*border-bottom-color:/s);
  assert.match(css, /\.investor-my-investment \.marketplace-page-header h1/);
  assert.match(css, /\.investor-my-investment \.investor-portfolio-header h1/);
  assert.match(tabs, /<h1 className="issuer-investor-management__heading">My Investment<\/h1>/);
});
