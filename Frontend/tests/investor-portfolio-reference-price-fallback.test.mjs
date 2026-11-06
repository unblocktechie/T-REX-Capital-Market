import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolvePortfolioReferencePrice, resolvePortfolioValuationPrice } from '../src/utils/portfolioValuationPrice.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('live price always overrides reference prices in a valuation', () => {
  const token = { initialTokenPriceExact: '0.001546', raw: { currentTokenPrice: '0.002' } };
  assert.deepEqual(resolvePortfolioValuationPrice(token, { status: 'ready', value: '0.003' }), {
    status: 'ready', source: 'live', value: '0.003', reason: '',
  });
});

test('explicit reported price overrides initial price, without claiming live verification', () => {
  const token = { initialTokenPriceExact: '0.001546', raw: { currentTokenPrice: '0.0025' } };
  const result = resolvePortfolioValuationPrice(token, { status: 'unavailable', reason: 'RPC failed' });
  assert.equal(result.status, 'reference');
  assert.equal(result.source, 'reported');
  assert.equal(result.value, '0.0025');
  assert.match(result.reason, /live price is unavailable/);
});

test('when live/explicit current price is unavailable, reference valuation can use initial price', async () => {
  const token = { initialTokenPriceExact: '0.001546', raw: { initialTokenPrice: '0.001546' } };
  const result = resolvePortfolioValuationPrice(token, { status: 'unavailable', value: '0' });
  assert.equal(result.value, '0.001546');
  assert.equal(result.source, 'initial');
  // Load the real decimal utility with its app-config import replaced for this
  // isolated Node test; verify tiny values never become a floating-point 0.
  const currencySource = (await read('../src/utils/currency.js')).replace(
    "import { appConfig } from '@/config/app.config';",
    "const appConfig = { defaultCurrency: 'USD', defaultLocale: 'en-US' };",
  );
  const currency = await import(`data:text/javascript;base64,${Buffer.from(currencySource).toString('base64')}`);
  assert.equal(currency.multiplyDecimalStrings('5', result.value), '0.00773');
  assert.equal(currency.formatDecimalForDisplay('0.00773').display, '0.00773');
});

test('mapper-derived currentTokenPriceExact alone is NOT treated as explicitly current', () => {
  assert.equal(resolvePortfolioReferencePrice({ currentTokenPriceExact: '999', initialTokenPriceExact: '2' }).source, 'initial');
  assert.equal(resolvePortfolioReferencePrice({ raw: { currentPrice: '0', initialPrice: '0' } }), null);
  assert.equal(resolvePortfolioValuationPrice({}, { status: 'unavailable' }).status, 'unavailable');
  assert.equal(resolvePortfolioValuationPrice({}, { status: 'loading' }).status, 'loading');
});

test('portfolio overview and table use the same labelled fallback price and keep exact arithmetic', async () => {
  const source = await read('../src/pages/investor-portal/PortfolioPage.jsx');
  assert.match(source, /resolvePortfolioValuationPrice\(\s*token, overviewData\.platformPrices\[portfolioAssetKey\(token\)\]/);
  assert.match(source, /const valuationPrice = resolvePortfolioValuationPrice\(token, currentPriceState\)/);
  assert.match(source, /multiplyDecimalValuesExact\(balanceState\.balance, valuationPrice\.value\)/);
  assert.match(source, /valu\w+\.status === 'reference'/);
});

test('Network Access remains routed but is not an investor sidebar menu', async () => {
  const source = await read('../src/config/navigation.js');
  assert.doesNotMatch(source, /label:\s*'Network Access',\s*shortLabel:\s*'Networks'/);
  assert.match(source, /\[ROUTES\.chainAccess\]: \{ title: 'Network Access'/);
  assert.doesNotMatch(source, /label: 'Bot Configuration'/);
  assert.match(source, /\[ROUTES\.issuerApiKeys\]: \{ title: 'Bot Configuration'/);
});

test('marketplace price cards have scoped separation and friendly investor empty states', async () => {
  const css = await read('../src/assets/styles/investor.css');
  const chart = await read('../src/components/price-history/PriceHistoryGraph.jsx');
  const table = await read('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(css, /\.marketplace-token-detail-page \.marketplace-investment-overview > \.price-history-panel--investor/);
  assert.match(chart, /No price changes to show for this period/);
  assert.match(table, /No price updates to show yet/);
});
