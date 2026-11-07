import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePriceHistoryQuery, normalizePriceHistoryResponse,
  priceHistorySource, priceHistoryStatus, exactPriceText, displayPriceTwoDecimals, priceHistoryQueryPrefix, assertPriceHistoryAssetMatch,
} from '../src/services/price-history/priceHistory.utils.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('endpoint limits and filters are sanitized (including 100-char search)', () => {
  assert.deepEqual(normalizePriceHistoryQuery({ page: 0, limit: 500, source: 'admin', status: 'BROKEN', search: 'x'.repeat(120) }), {
    page: 1, limit: 100, source: 'all', status: 'all', search: 'x'.repeat(100),
  });
  assert.deepEqual(normalizePriceHistoryQuery({ page: 3, limit: 20, source: 'blockchain', status: 'FAILED', search: '  0xabc  ' }), {
    page: 3, limit: 20, source: 'blockchain', status: 'FAILED', search: '0xabc',
  });
  assert.equal(normalizePriceHistoryQuery({ status: 'CANCELLED' }).status, 'CANCELLED');
});

test('investor price-history query includes tokenUid but issuer query stays unchanged', () => {
  const filters = { page: 2, limit: 20, source: 'blockchain', status: 'CONFIRMED', search: '0xabc' };
  const issuer = normalizePriceHistoryQuery(filters);
  assert.equal(Object.hasOwn(issuer, 'tokenUid'), false);
  const investor = normalizePriceHistoryQuery({ ...filters, tokenUid: '  marketplace-asset-uid  ' });
  assert.deepEqual(investor, { ...issuer, tokenUid: 'marketplace-asset-uid' });
  assert.equal(new URLSearchParams(investor).get('tokenUid'), 'marketplace-asset-uid');
});

test('enveloped data pagination is preserved', () => {
  const result = normalizePriceHistoryResponse({ data: [{ priceUpdateUid: 'one' }], meta: { pagination: { page: 2, limit: 20, total: 51, totalPages: 3 } } });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.pagination, { page: 2, limit: 20, total: 51, totalPages: 3 });
});

test('legacy applied never pretends to be blockchain confirmed', () => {
  assert.equal(priceHistorySource({ submissionMode: 'LEGACY', isLegacyUpdate: true }).text, 'Database update');
  assert.equal(priceHistoryStatus('APPLIED').text, 'APPLIED');
  assert.equal(priceHistorySource({ submissionMode: 'INDEXED', isOnchainUpdate: true }).text, 'Blockchain');
  assert.equal(priceHistoryStatus('ORPHANED').tone, 'danger');
  assert.equal(priceHistoryStatus('PENDING').tone, 'warning');
  assert.equal(priceHistoryStatus('CANCELLED').tone, 'info');
  assert.equal(priceHistoryStatus('EXPIRED').tone, 'danger');
  assert.equal(normalizePriceHistoryQuery({ status: 'EXPIRED' }).status, 'EXPIRED');
});

test('exact financial values are not converted to JS floats', () => {
  const exact = '123456789012345678.000000000000000001';
  assert.equal(exactPriceText(exact), exact);
  assert.equal(exactPriceText(null), '—');
});

test('two-digit price displays round safely without losing the tooltip-precision value', () => {
  assert.equal(displayPriceTwoDecimals('1.000000000000000000'), '1.00');
  assert.equal(displayPriceTwoDecimals('1000.005'), '1,000.01');
  assert.equal(displayPriceTwoDecimals('0.999'), '1.00');
  assert.equal(displayPriceTwoDecimals('123456789012345678.009999'), '123,456,789,012,345,678.01');
  assert.equal(displayPriceTwoDecimals('-0.125'), '-0.13');
  assert.equal(displayPriceTwoDecimals(null), '—');
});

test('cache scoped to user and network for isolation', () => {
  assert.notDeepEqual(priceHistoryQueryPrefix('alice', 'sepolia'), priceHistoryQueryPrefix('bob', 'sepolia'));
  assert.notDeepEqual(priceHistoryQueryPrefix('alice', 'sepolia'), priceHistoryQueryPrefix('alice', 'mainnet'));
});

test('issuer summary and investor chart both use authenticated JWT price history endpoint', () => {
  const api = read('../src/api/tokens/token.api.js');
  const endpoints = read('../src/api/tokens/token.endpoints.js');
  const investorPage = read('../src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  const issuerPanel = read('../src/components/price-history/IssuerPriceHistory.jsx');
  const historyQuery = read('../src/components/price-history/useHistoryData.js');
  const interceptors = read('../src/api/axios/interceptors.js');
  assert.match(endpoints, /priceHistory: '\/tokens\/me\/price-history'/);
  assert.match(api, /getMyPriceHistory:[\s\S]*?apiClient[\s\S]*?\.get\(TOKEN_ENDPOINTS.priceHistory/);
  assert.match(investorPage, /<PriceHistoryGraph[\s\S]*?viewer="investor"/);
  assert.match(issuerPanel, /const pageSize = compact \? 3 : investor \? 5 : 10/);
  assert.match(issuerPanel, /viewer, page, limit: pageSize/);
  assert.match(historyQuery, /tokenApi\.getMyPriceHistory/);
  assert.match(historyQuery, /investor \? \{ tokenUid: String\(tokenUid\)\.trim\(\) \} : \{\}/);
  assert.match(historyQuery, /assertPriceHistoryAssetMatch/);
  assert.match(interceptors, /tokenService\.getAccessToken\(\)/);
  assert.match(interceptors, /config\.headers\['X-Chain-Uid'\]/);
  assert.doesNotMatch(investorPage, /InvestorOnchainPriceHistory|fetchRecentPublicPriceEvents/);
});

test('issuer full route includes graph and paginated table without old filter controls', () => {
  const panel = read('../src/components/price-history/IssuerPriceHistory.jsx');
  const css = read('../src/assets/styles/price-history.css');
  const route = read('../src/routes/router.jsx');
  const page = read('../src/pages/tokens/TokenPriceHistoryPage.jsx');
  assert.doesNotMatch(panel, /Search price updates|All sources|All statuses|price-history-filters|price-history-filter/);
  assert.doesNotMatch(css, /price-history-filters|price-history-search-control/);
  assert.match(panel, /View Full History/);
  assert.match(panel, /const pageSize = compact \? 3 : investor \? 5 : 10/);
  assert.match(panel, /viewer, page, limit: pageSize/);
  assert.match(panel, /setPage\(\(current\) => current \+ 1\)/);
  assert.match(route, /tokens\/:tokenAddress\/price-history/);
  assert.match(page, /<PriceHistoryGraph/);
  assert.match(page, /<IssuerPriceHistory/);
});

test('investor results are guarded against a different asset or chain', () => {
  const scope = { tokenUid: 'asset-123', tokenAddress: '0xAABB', chainId: 11155111 };
  const correct = [{ tokenUid: 'asset-123', tokenAddress: '0xaabb', chainId: 11155111 }];
  assert.strictEqual(assertPriceHistoryAssetMatch(correct, scope), correct);
  assert.throws(() => assertPriceHistoryAssetMatch([{ tokenUid: 'another-asset' }], scope), /different investment/);
  assert.throws(() => assertPriceHistoryAssetMatch([{ tokenAddress: '0xbbbb' }], scope), /different investment/);
  assert.throws(() => assertPriceHistoryAssetMatch([{ chainId: 1 }], scope), /different investment/);
});

test('direct price verification refreshes history only after backend confirms transaction', () => {
  const issuer = read('../src/pages/tokens/TokenDetailsPage.jsx');
  assert.match(issuer, /priceHistoryQueryPrefix\(token.userKey, pending.chainUid\)/);
  assert.match(issuer, /runPriceVerification\(broadcast\)/);
  assert.match(issuer, /<IssuerPriceHistory/);
  assert.match(issuer, /clearTokenPriceSyncRecovery\(pending.tokenAddress/);
});

test('investor graph uses selected chain UID and scoped cache', () => {
  const investor = read('../src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  const history = read('../src/components/price-history/useHistoryData.js');
  assert.match(investor, /activeChainUidByUser/);
  assert.match(investor, /selectedChainUid=\{selectedChainUid\}/);
  assert.match(investor, /tokenUid=\{token.id\}/);
  assert.match(history, /enabled,\s*staleTime/);
  assert.match(history, /\.\.\.priceHistoryQueryPrefix\(userKey, chainUid\), viewer, tokenUid/);
});

test('narrow-screen CSS uses card reflow and no forced wide tables', () => {
  const css = read('../src/assets/styles/price-history.css');
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(max-width: 365px\)/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
});
