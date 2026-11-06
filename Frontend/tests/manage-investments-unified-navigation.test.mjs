import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ROUTES } from '../src/config/routes.js';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const marketplaceDetail = source('pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
const marketplace = source('pages/investor-portal/MarketplacePage.jsx');
const application = source('pages/investor-portal/ApplicationDetailsPage.jsx');
const management = source('pages/investor-portal/AssetManagementPage.jsx');
const router = source('routes/router.jsx');

test('each operation links to the correct Manage Investments tab and keeps the selected application', () => {
  for (const tab of ['invest', 'send', 'redeem']) {
    const url = ROUTES.assetManagementAction({ interestUid: 'application-123', tab });
    assert.equal(url, `/app/asset-management?interestUid=application-123&tab=${tab}`);
    const params = new URL(url, 'https://example.test').searchParams;
    assert.equal(params.get('interestUid'), 'application-123');
    assert.equal(params.get('tab'), tab);
    assert.match(marketplaceDetail, new RegExp(`navigate\\(ROUTES\\.assetManagementAction\\(\\{ interestUid, tab: '${tab}' \\}\\)\\)`));
  }
});

test('query string is escaped and tokenUid links remain supported', () => {
  assert.equal(ROUTES.assetManagementAction({ interestUid: 'a&b', tab: 'send' }), '/app/asset-management?interestUid=a%26b&tab=send');
  assert.equal(ROUTES.assetManagementAction({ tokenUid: 'token-1', tab: 'redeem' }), '/app/asset-management?tokenUid=token-1&tab=redeem');
  assert.equal(ROUTES.assetManagementAction({ interestUid: 'id', tab: 'invalid' }), '/app/asset-management?interestUid=id&tab=invest');
});

test('Marketplace ready-to-invest and application ready-to-invest link to the unified screen', () => {
  assert.match(marketplace, /navigate\(ROUTES\.assetManagementAction\(\{ interestUid, tab: 'invest' \}\)\)/);
  assert.match(application, /navigate\(ROUTES\.assetManagementAction\(\{ interestUid, tab: 'invest' \}\)\)/);
});

test('Manage Investments responds to URL tab and selected investment without silently picking another token', () => {
  assert.match(management, /const requestedTab = searchParams\.get\('tab'\)/);
  assert.match(management, /TABS\.some\(\(tab\) => tab\.id === requestedTab\)/);
  assert.match(management, /setSearchParams\(\(previous\) =>/);
  assert.match(management, /next\.set\('interestUid', interestUid\)/);
  assert.match(management, /requestedInterestUid\s*\? \(tokenOptions\.some/);
  assert.match(management, /<PurchaseTokenPage key=/);
  assert.match(management, /<SendTokenPage key=/);
  assert.match(management, /<RedeemTokenPage key=/);
});

test('retired standalone pages redirect instead of rendering their own operation screen', () => {
  assert.match(router, /function InvestmentOperationRedirect\(\{ tab \}\)/);
  for (const [suffix,tab] of [['purchase','invest'],['send','send'],['redeem','redeem']]) {
    assert.match(router, new RegExp(`path: 'applications/:interestUid/${suffix}', element: <InvestmentOperationRedirect tab="${tab}" \\/>`));
  }
  assert.doesNotMatch(router, /withWorkspaceSuspense\(<(?:PurchaseTokenPage|SendTokenPage|RedeemTokenPage)/);
});
