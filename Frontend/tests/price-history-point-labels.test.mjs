import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  displayHistoryChartPrice, displayPriceTwoDecimals, exactPriceText,
  historyChartTooltipPrice, PRICE_HISTORY_PRICE_THRESHOLD,
} from '../src/services/price-history/priceHistory.utils.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the configurable threshold refers to a PRICE, not the number of data points', () => {
  assert.equal(PRICE_HISTORY_PRICE_THRESHOLD, 10);
  const chart = source('../src/components/price-history/PriceHistoryGraph.jsx');
  assert.match(chart, /displayHistoryChartPrice\(payload\.price\)/);
  assert.match(chart, /displayHistoryChartPrice\(tick\.price\)/);
  assert.match(chart, /displayPriceTwoDecimals\(currentPrice\)/);
  assert.doesNotMatch(chart, /displayHistoryChartPrice\(currentPrice\)/);
  assert.doesNotMatch(chart, /shouldShowHistoryPointLabel|PRICE_HISTORY_POINT_LABEL_LIMIT|pointCount/);
  assert.match(chart, /<text\s+x=\{labelX\}/);
  assert.match(chart, /dot=\{\(props\) => <PriceDot/);
});

test('chart dot and vertical-axis values respect the value threshold', () => {
  const cases = new Map([
    ['0.50', '0.50'], ['0.12234213456789', '0.12'], ['9.999', '10.00'],
    ['10', '10.00'], ['10.000000', '10.00'], ['20.50', '20'],
    ['20.51', '21'], ['25.99', '26'], ['125.38', '125'],
    ['375.13', '375'], ['500.000000000000', '500'],
    ['0.012345', '0.0123'], ['0.00123456', '0.001235'],
    ['0.000000123456', '0.0000001235'],
  ]);
  for (const [raw, display] of cases) assert.equal(displayHistoryChartPrice(raw), display, raw);
  assert.equal(displayHistoryChartPrice('1000000000000000.5000000000000000'), '1,000,000,000,000,000');
  assert.equal(displayHistoryChartPrice('1000000000000001.5000000000000000'), '1,000,000,000,000,002');
});

test('chart hover tooltips keep the entire original precision including backend zero-padding', () => {
  const cases = new Map([
    ['6', '6'],
    ['6.000000', '6.000000'],
    ['10.000000000000000', '10.000000000000000'],
    ['500.000000000000000000', '500.000000000000000000'],
    ['20.5000000000000000', '20.5000000000000000'],
    ['20.50', '20.50'],
    ['0.122342134567890000', '0.122342134567890000'],
    ['10.0050000000000', '10.0050000000000'],
    ['0.000000000000000001', '0.000000000000000001'],
  ]);
  for (const [raw, display] of cases) assert.equal(historyChartTooltipPrice(raw), display, raw);
  assert.equal(exactPriceText('20.500000000'), '20.500000000', 'underlying precision stays untouched');
  const chart = source('../src/components/price-history/PriceHistoryGraph.jsx');
  assert.match(chart, /<strong>\{historyChartTooltipPrice\(selected\.price\)\} \{symbol\}<\/strong>/);
  assert.match(chart, /title=\{`\$\{exactPriceText\(currentPrice\)\} \$\{symbol\}`\.trim\(\)\}/);
  assert.match(chart, /onMouseEnter=\{choosePoint\}/);
  assert.match(chart, /onClick=\{choosePoint\}/);
});

test('Y-axis and dot labels use threshold, but selected summary and tooltip are independent', () => {
  const chart = source('../src/components/price-history/PriceHistoryGraph.jsx');
  assert.match(chart, /const labelsByTick = new Map\(ticks\.map\(\(tick\) => \[100 - tick\.y, displayHistoryChartPrice\(tick\.price\)\]\)\)/);
  assert.match(chart, /\{priceLabel\}<\/text>/);
  assert.match(chart, /\{displayPriceTwoDecimals\(currentPrice\)\} \{symbol\}/);
  assert.doesNotMatch(chart, /\{displayHistoryChartPrice\(currentPrice\)\} \{symbol\}/);
  assert.match(chart, /<strong>\{historyChartTooltipPrice\(selected\.price\)\} \{symbol\}<\/strong>/);
  assert.match(chart, /const labelSpacing = Math\.max\(118,/);
  assert.match(chart, /ResponsiveContainer/);
  const css = source('../src/assets/styles/price-history.css');
  assert.match(css, /\.price-history-chart__plot-scroll\s*\{[^}]*overflow-x: auto/s);
  assert.match(css, /\.price-history-chart__point-price\s*\{[^}]*pointer-events: none/s);
});

test('threshold affects chart labels only while other values and tooltips remain exact', () => {
  assert.equal(displayHistoryChartPrice('20.50'), '20');
  assert.equal(displayPriceTwoDecimals('20.50'), '20.50');
  assert.equal(historyChartTooltipPrice('20.50000000'), '20.50000000');
  assert.equal(displayHistoryChartPrice('375.13'), '375');
  assert.equal(displayPriceTwoDecimals('375.13'), '375.13');
  assert.equal(historyChartTooltipPrice('0.122342134567890000'), '0.122342134567890000');
});

test('the historical display helper delegates to the shared adaptive formatter', () => {
  assert.equal(displayPriceTwoDecimals('10.005'), '10.01');
  assert.equal(displayPriceTwoDecimals('0.500000000000001'), '0.50');
});


test('changing the threshold changes only chart labels without changing other prices', () => {
  assert.equal(displayHistoryChartPrice('20.50', 30), '20.50');
  assert.equal(displayHistoryChartPrice('20.50', 10), '20');
  assert.equal(displayHistoryChartPrice('20.50', 5), '20');
  assert.equal(displayHistoryChartPrice('10.01', 10), '10');
  assert.equal(displayHistoryChartPrice('10.50', 10), '10');
  assert.equal(displayHistoryChartPrice('11.50', 10), '12');
  assert.equal(displayHistoryChartPrice('0.000000123456', 10), '0.0000001235');
  assert.equal(displayHistoryChartPrice('0', 10), '0.00');
  assert.equal(displayPriceTwoDecimals('20.50'), '20.50');
  assert.equal(historyChartTooltipPrice('20.500000'), '20.500000');
});

test('issuer history uses the shared tooltip without an additional browser-native title', () => {
  const history = source('../src/components/price-history/IssuerPriceHistory.jsx');
  assert.match(history, /<CommonPriceValue value=\{value\}/);
  assert.doesNotMatch(history, /className="price-history-price" title=/);
});
