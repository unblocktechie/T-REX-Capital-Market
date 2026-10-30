import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ROUTES } from '../src/config/routes.js';
import { INVESTOR_MANAGEMENT_TABS, resolveInvestorManagementTab } from '../src/utils/issuerInvestorManagementTabs.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('investor management has three stable deep-linkable tabs', () => {
  assert.equal(ROUTES.issuerInvestorManagement, '/app/investor-management');
  assert.deepEqual(INVESTOR_MANAGEMENT_TABS.map((tab) => tab.label), [
    'Investors', 'Investment Requests', 'Redemption Requests',
  ]);
  for (const { id } of INVESTOR_MANAGEMENT_TABS) {
    assert.equal(resolveInvestorManagementTab(id), id);
    assert.equal(ROUTES.issuerInvestorManagementTab(id), `/app/investor-management?tab=${id}`);
  }
  assert.equal(resolveInvestorManagementTab('unknown'), 'investors');
  assert.equal(resolveInvestorManagementTab(null), 'investors');
});

test('issuer sidebar has one Investor Management item; old destinations remain available as redirects', async () => {
  const nav = await read('../src/config/navigation.js');
  const router = await read('../src/routes/router.jsx');
  const issuerRoute = await read('../src/pages/investors/InvestorsRoutePage.jsx');
  assert.match(nav, /label: 'Investor Management'/);
  assert.doesNotMatch(nav, /label: 'Investment Requests'/);
  assert.doesNotMatch(nav, /label: 'Redemption Requests'/);
  assert.match(router, /path: 'investor-management', element: withWorkspaceSuspense\(<IssuerInvestorManagementPage \/>\)/);
  assert.match(router, /path: 'investor-directory', element: <Navigate to=\{ROUTES.issuerInvestorManagementTab\('investors'\)\} replace \/>/);
  assert.match(router, /path: 'redemptions', element: <Navigate to=\{ROUTES.issuerInvestorManagementTab\('redemption-requests'\)\} replace \/>/);
  assert.match(router, /path: 'investors\/:requestId', element: withWorkspaceSuspense\(<IssuerInvestorSubscriptionReviewPage \/>\)/);
  assert.match(router, /path: 'redemptions\/:redemptionUid', element: withWorkspaceSuspense\(<IssuerRedemptionDetailPage \/>\)/);
  assert.match(issuerRoute, /user\?\.role === ROLES.investor\) return <InvestorOnboardingPage \/>/);
  assert.match(issuerRoute, /issuerInvestorManagementTab\('investment-requests'\)/);
});

test('tabs keep visited screens mounted, preserve independent screen state, and retain their existing controls', async () => {
  const page = await read('../src/pages/issuer/IssuerInvestorManagementPage.jsx');
  assert.match(page, /useSearchParams\(\)/);
  assert.match(page, /new Set\(\[activeTab\]\)/);
  assert.match(page, /visitedTabs\.has\(tab\.id\) \|\| tab\.id === activeTab/);
  assert.match(page, /hidden=\{activeTab !== tab\.id\}/);
  assert.match(page, /role="tab"/);
  assert.match(page, /role="tabpanel"/);
  assert.match(page, /IssuerInvestorDirectoryPage embedded/);
  assert.match(page, /IssuerInvestorsPage embedded/);
  assert.match(page, /IssuerRedemptionsPage embedded/);
  assert.match(await read('../src/pages/issuer/IssuerInvestorDirectoryPage.jsx'), /Invite Investor/);
  assert.match(await read('../src/pages/issuer/IssuerInvestorsPage.jsx'), /Export CSV/);
  assert.match(await read('../src/pages/issuer/IssuerRedemptionsPage.jsx'), /Refresh/);
});

test('sidebar badge preserves action indicators and previously hidden network routes', async () => {
  const sidebar = await read('../src/layouts/components/Sidebar.jsx');
  assert.match(sidebar, /hiddenSidebarRoutes = new Set\(\[ROUTES.organization, ROUTES.chainAccess\]\)/);
  assert.match(sidebar, /item\.to === ROUTES.issuerInvestorManagement/);
  assert.match(sidebar, /actionIndicators\.data\?\.\[ROUTES.investors\]/);
  assert.match(sidebar, /actionIndicators\.data\?\.\[ROUTES.issuerRedemptions\]/);
});
