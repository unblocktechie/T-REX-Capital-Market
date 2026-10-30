import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ROUTES } from '../src/config/routes.js';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('all investor actions deep-link into Manage Investments and preserve interest UID', () => {
  const uid = 'UID with spaces & /?';
  for (const [method, tab] of [['purchaseToken', 'invest'], ['sendToken', 'send'], ['redeemToken', 'redeem']]) {
    const path = ROUTES[method](uid);
    const url = new URL(path, 'https://example.test');
    assert.equal(url.pathname, ROUTES.assetManagement);
    assert.equal(url.searchParams.get('tab'), tab);
    assert.equal(url.searchParams.get('interestUid'), uid);
  }
  assert.equal(ROUTES.assetManagementAction('send', 'UID'), ROUTES.sendToken('UID'));
});

test('legacy standalone URLs redirect rather than rendering duplicate pages', async () => {
  const router = await source('../src/routes/router.jsx');
  for (const [suffix, tab] of [['purchase', 'invest'], ['send', 'send'], ['redeem', 'redeem']]) {
    assert.ok(router.includes(`path: 'applications/:interestUid/${suffix}', element: <LegacyInvestorOperationRedirect tab="${tab}" />`));
    assert.doesNotMatch(router, new RegExp(`path: 'applications/:interestUid/${suffix}', element: withWorkspaceSuspense`));
  }
  assert.match(router, /params\.set\('interestUid', interestUid\)/);
  assert.match(router, /state=\{location\.state\}/);
  assert.match(router, /replace/);
});

test('selected application and operation tab follow the URL with no stale local override', async () => {
  const page = await source('../src/pages/investor-portal/AssetManagementPage.jsx');
  assert.match(page, /\[searchParams, setSearchParams\] = useSearchParams\(\)/);
  assert.match(page, /onChange=\{changeInvestment\}/);
  assert.match(page, /onClick=\{\(\) => changeTab\(tab\.id\)\}/);
  assert.match(page, /next\.set\('interestUid', interestUid\)/);
  assert.match(page, /next\.set\('tab', tab\)/);
  assert.match(page, /const selectionUnavailable = hasExplicitSelection && !resolvedInterestUid/);
  assert.doesNotMatch(page, /\[selectedInterestUid, setSelectedInterestUid\]/);
  for (const operation of ['PurchaseTokenPage', 'SendTokenPage', 'RedeemTokenPage']) {
    assert.ok(page.includes(`${operation} key={`));
  }
});

test('investment dropdown is bordered and remains responsive', async () => {
  const css = await source('../src/assets/styles/investor.css');
  assert.match(css, /\.asset-management-token-dropdown \.marketplace-dropdown__trigger \{[\s\S]*?border: 1px solid/);
  assert.match(css, /\.asset-management-token-dropdown \.marketplace-dropdown__trigger:focus-visible/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.asset-management-token-selector \{\s*grid-template-columns: 1fr;/);
});

test('Marketplace, investment details and application details route via shared helpers', async () => {
  const marketplace = await source('../src/pages/investor-portal/MarketplacePage.jsx');
  const details = await source('../src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  const application = await source('../src/pages/investor-portal/ApplicationDetailsPage.jsx');
  assert.match(marketplace, /ROUTES\.purchaseToken\(interestUid\)/);
  assert.match(application, /ROUTES\.purchaseToken\(interestUid\)/);
  for (const method of ['purchaseToken', 'sendToken', 'redeemToken']) {
    assert.ok(details.includes(`ROUTES.${method}(interestUid)`));
  }
});
