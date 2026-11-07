import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareHistoryPrices } from '../src/services/price-history/priceHistory.utils.js';

const graph = readFileSync(new URL('../src/components/price-history/PriceHistoryGraph.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/assets/styles/price-history.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/tokens/TokenPriceHistoryPage.jsx', import.meta.url), 'utf8');

test('exact decimal string comparisons do not lose precision', () => {
  assert.equal(compareHistoryPrices('1000.000000000000000001', '1.000000000000000001'), 1);
  assert.equal(compareHistoryPrices('1.000000000000000000', '1000.000000000000000001'), -1);
  assert.equal(compareHistoryPrices('1.000000000000000001', '1.000000000000000001'), 0);
});

test('Recharts single line retains the existing theme color and responsive styles', () => {
  assert.match(css, /--price-history-line: #6c91f7;/);
  assert.match(css, /\.price-history-chart__segment \{[^}]*stroke: var\(--price-history-line\)/s);
  assert.match(css, /\.price-history-chart__point \{ --point-color: var\(--price-history-line\)/);
  assert.match(graph, /stopColor="var\(--price-history-line\)"/);
  assert.match(graph, /className="price-history-chart__segment"/);
  assert.match(graph, /className=\{`price-history-chart__point\$\{active \? ' is-active' : ''\}`\}/);
  assert.match(graph, /ResponsiveContainer/);
  assert.match(css, /@media \(max-width: 680px\)/);
});

test('Line/Candles switch, candle rendering and OHLC details are removed', () => {
  assert.doesNotMatch(graph, /chartMode|setChartMode|CandleIcon|historyPriceCandles|historyCandleCoordinates|priceHistoryCandleInterval/);
  assert.doesNotMatch(graph, /Candles|candlePoints|price-history-chart__ohlc|price-history-chart__mode/);
  assert.doesNotMatch(css, /price-history-chart__candle|price-history-chart__ohlc|price-history-chart__mode/);
  assert.match(graph, /Price history time range/);
  assert.match(graph, /is-line"><i aria-hidden="true" \/>Recorded price/);
  assert.match(graph, /onMouseEnter=\{choosePoint\}/);
  assert.match(graph, /onKeyDown=/);
});

test('full price-history page retains the wide and mobile-safe layout', () => {
  assert.match(page, /className="price-history-full-page"/);
  assert.match(css, /\.price-history-full-page \{ width: 100%; max-width: 1360px; box-sizing: border-box;/);
  assert.match(css, /\.price-history-full-page \{ padding: 18px 12px 28px;/);
});
