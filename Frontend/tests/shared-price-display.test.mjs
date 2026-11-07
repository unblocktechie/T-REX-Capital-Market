import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatPriceDisplay, formatPriceText } from '../src/utils/priceDisplay.js';
import { formatAdminTokenPrice } from '../src/utils/adminTokenDisplay.js';
import { displayPriceTwoDecimals, displayHistoryChartPrice } from '../src/services/price-history/priceHistory.utils.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared price formatting exactly follows the requested examples', () => {
  const cases = [
    ['350','350.00'], ['1','1.00'], ['0.123456','0.12'],
    ['0.012345','0.0123'], ['0.00123456','0.001235'],
    ['0.000123000000000000','0.000123'],
    ['0.000000123456','0.0000001235'], ['0','0.00'],
  ];
  for (const [value, expected] of cases) assert.equal(formatPriceText(value), expected, value);
});

test('exact values remain available for hover and tiny nonzero amounts never become zero', () => {
  const item = formatPriceDisplay('0.0000001234560000000');
  assert.equal(item.display, '0.0000001235');
  assert.equal(item.exact, '0.0000001234560000000');
  assert.equal(formatPriceText('0.00000000000000000001'), '0.00000000000000000001');
  assert.equal(formatPriceDisplay('10.000000000000000000').exact, '10.000000000000000000');
  assert.equal(formatPriceText('-0.00123456'), '-0.001235');
  assert.equal(formatPriceText('0.099999'), '0.10');
  assert.equal(formatPriceText('9007199254740993.1999'), '9,007,199,254,740,993.20');
  assert.equal(formatPriceText(null), '—');
  assert.equal(formatPriceText('N/A'), '—');
});

test('hover text reflects the entire source value, without adding or removing decimals', () => {
  const cases = [
    ['6', '6.00', '6'],
    ['6.0', '6.00', '6.0'],
    ['6.000000', '6.00', '6.000000'],
    ['6.1234567890123456789', '6.12', '6.1234567890123456789'],
    ['0', '0.00', '0'],
    ['0.000000000000000000', '0.00', '0.000000000000000000'],
    ['0.000000123456000', '0.0000001235', '0.000000123456000'],
    ['0.123456', '0.12', '0.123456'],
    ['20.50000000000', '20.50', '20.50000000000'],
  ];
  for (const [value, expectedDisplay, expectedHover] of cases) {
    const actual = formatPriceDisplay(value);
    assert.equal(actual.display, expectedDisplay, `display for ${value}`);
    assert.equal(actual.exact, expectedHover, `hover for ${value}`);
  }
});

test('admin and non-chart history helpers share precision while chart labels retain the threshold', () => {
  for (const raw of ['0.000000123456','0.012345','10','350','2.3500000000000','0']) {
    const expected = formatPriceText(raw);
    assert.equal(formatAdminTokenPrice(raw), expected);
    assert.equal(displayPriceTwoDecimals(raw), expected);
    if (Number(raw) <= 10) assert.equal(displayHistoryChartPrice(raw), expected);
  }
});

test('issuer, investor, admin and on-chain prices are routed through the shared price component', () => {
  const component = read('src/components/common/PriceValue.jsx');
  const alias = read('src/components/common/TokenPriceValue.jsx');
  const issuer = read('src/pages/tokens/TokenDetailsPage.jsx');
  const investor = read('src/pages/investor-portal/PortfolioPage.jsx');
  const admin = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');
  const history = read('src/components/price-history/InvestorOnchainPriceHistory.jsx');
  assert.match(component, /formatPriceDisplay\(value\)/);
  assert.match(component, /<ResponsiveTooltip/);
  assert.match(component, /content=\{`\$\{label\}: \$\{prefix\}\$\{exact\}\$\{suffix\}`\}/);
  assert.match(alias, /PriceValue as TokenPriceValue/);
  assert.match(issuer, /<TokenPriceValue value=\{currentPrice\}/);
  assert.match(investor, /<PriceValue value=\{currentPrice\}/);
  assert.match(admin, /<PriceValue value=\{price\} label=\{label\}/);
  assert.match(history, /<PriceValue value=\{row\.oldPriceFormatted\}/);
});


test('global price formatting is unaffected by the chart-only threshold', () => {
  assert.equal(formatPriceText('20.50'), '20.50');
  assert.equal(displayPriceTwoDecimals('20.50'), '20.50');
  assert.equal(displayHistoryChartPrice('20.50'), '20');
  assert.equal(formatPriceText('375.13'), '375.13');
  assert.equal(displayHistoryChartPrice('375.13'), '375');
});
