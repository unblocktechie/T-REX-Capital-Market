import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compareHistoryPrices,
  historyPriceCandles,
  historyCandleCoordinates,
  priceHistoryCandleInterval,
  historyChartPriceTicks,
} from '../src/services/price-history/priceHistory.utils.js';

const record = (day, price, status = 'CONFIRMED') => ({
  createdAt: day, confirmedAt: day, status, newPriceFormatted: price,
});
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('OHLC candles summarize observed prices in chronological order, never imaginary trades', () => {
  const rows = [
    record('2026-10-07T13:00:00Z', '2.300000000000000002'),
    record('2026-10-07T09:00:00Z', '1.200000000000000001'),
    record('2026-10-07T10:00:00Z', '3.900000000000000009'),
    record('2026-10-07T11:00:00Z', '0.800000000000000003'),
    record('2026-10-08T14:00:00Z', '2.000000000000000001'),
    record('2026-10-07T12:00:00Z', '120', 'FAILED'),
    record('2026-10-07T13:10:00Z', '400', 'PENDING'),
  ];
  const candles = historyPriceCandles(rows, 'day');
  assert.equal(candles.length, 2);
  assert.deepEqual(candles[0], {
    key: '2026-10-07T00:00:00.000Z', bucketStart: '2026-10-07T00:00:00.000Z',
    startAt: '2026-10-07T09:00:00Z', endAt: '2026-10-07T13:00:00Z',
    open: '1.200000000000000001', high: '3.900000000000000009',
    low: '0.800000000000000003', close: '2.300000000000000002', count: 4,
  });
  assert.equal(candles[1].open, candles[1].close);
  assert.equal(candles[1].count, 1);
  assert.equal(compareHistoryPrices(candles[0].high, candles[0].low), 1);
});

test('candles keep exact prices beyond JS Number precision and scale their wicks', () => {
  const candles = historyPriceCandles([
    record('2026-10-07T08:00:00Z', '123456789012345678.000000000000000001'),
    record('2026-10-07T09:00:00Z', '123456789012345678.000000000000000009'),
    record('2026-10-07T10:00:00Z', '123456789012345678.000000000000000004'),
  ], 'day');
  assert.equal(candles[0].high, '123456789012345678.000000000000000009');
  assert.equal(candles[0].low, '123456789012345678.000000000000000001');
  const [pos] = historyCandleCoordinates(candles);
  assert.equal(pos.yHigh, 0);
  assert.equal(pos.yLow, 100);
  assert.equal(pos.yOpen, 100);
  assert.equal(pos.yClose, 62.5);
  const ticks = historyChartPriceTicks([{ newPriceFormatted: candles[0].high }, { newPriceFormatted: candles[0].low }]);
  assert.equal(ticks[0].price, candles[0].high);
});

test('groups across UTC boundaries and excludes empty periods', () => {
  const records = [
    record('2026-09-30T23:59:59Z', '3'),
    record('2026-10-01T00:00:01Z', '2'),
    record('2026-10-09T13:00:00Z', '4'),
  ];
  assert.equal(historyPriceCandles(records, 'month').length, 2);
  assert.equal(historyPriceCandles(records, 'day').length, 3);
  // Sep 30 and Oct 1 share the same Monday-based UTC week.
  assert.equal(historyPriceCandles(records, 'week').length, 2);
  const groups = historyPriceCandles(records, 'fortnight');
  assert.ok(groups.length >= 1 && groups.length <= 3);
});

test('falling, rising and unchanged candles use observed opening/closing prices', () => {
  const candles = historyPriceCandles([
    record('2026-10-07T09:00:00Z', '10'),
    record('2026-10-07T10:00:00Z', '7'),
    record('2026-10-08T09:00:00Z', '8'),
    record('2026-10-08T10:00:00Z', '12'),
    record('2026-10-09T09:00:00Z', '12'),
  ], 'day');
  assert.equal(compareHistoryPrices(candles[0].close, candles[0].open), -1);
  assert.equal(compareHistoryPrices(candles[1].close, candles[1].open), 1);
  assert.equal(compareHistoryPrices(candles[2].close, candles[2].open), 0);
  assert.equal(candles[1].high, '12');
  assert.equal(candles[1].low, '8');
});

test('responsive candles use readable UTC periods with unchanged time-range filters', () => {
  assert.equal(priceHistoryCandleInterval(3, 800), 'day');
  assert.equal(priceHistoryCandleInterval(3, 375), 'week');
  assert.equal(priceHistoryCandleInterval(6, 800), 'week');
  assert.equal(priceHistoryCandleInterval(6, 375), 'fortnight');
  assert.equal(priceHistoryCandleInterval(12, 375), 'month');
});

test('both viewers share Line / Candles toggle, hover/focus and preserved api query', () => {
  const graph = read('../src/components/price-history/PriceHistoryGraph.jsx');
  const styles = read('../src/assets/styles/price-history.css');
  assert.match(graph, /useState\('line'\)/);
  assert.match(graph, /setChartMode\('candles'\)/);
  assert.match(graph, /role="group" aria-label="Chart style"/);
  assert.match(graph, /aria-pressed=\{chartMode === 'candles'\}/);
  assert.match(graph, /historyPriceCandles\(visible, candleInterval\)/);
  assert.match(graph, /onMouseEnter=\{\(\) => setSelectedKey\(candle.key\)\}/);
  assert.match(graph, /onKeyDown=/);
  assert.match(graph, /Candles summarize saved price updates/);
  assert.match(graph, /useYearPriceHistory\(\{ \.\.\.scope, viewer \}\)/);
  assert.match(styles, /price-history-chart__candle.is-up/);
  assert.match(styles, /price-history-chart__candle.is-down/);
  assert.match(styles, /max-width: 680px/);
});
