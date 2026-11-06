import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historyChartCoordinates, historyChartPriceTicks } from '../src/services/price-history/priceHistory.utils.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('closely spaced updates remain equally visible without collapsed vertical spikes', () => {
  const rows = ['1.00', '1000.00', '1.00'].map((newPriceFormatted) => ({ newPriceFormatted, createdAt: '2026-10-06T14:40:00Z' }));
  const points = historyChartCoordinates(rows);
  assert.deepEqual(points.map((p) => p.x), [0, 50, 100]);
  assert.deepEqual(points.map((p) => p.y), [100, 0, 100]);
});

test('axis tick generation keeps precise prices as decimal strings', () => {
  const ticks = historyChartPriceTicks([
    { newPriceFormatted: '123456789012345678.000000000000000001' },
    { newPriceFormatted: '123456789012345678.000000000000000005' },
  ]);
  assert.equal(ticks.length, 5);
  assert.equal(ticks[0].price, '123456789012345678.000000000000000005');
  assert.equal(ticks[4].price, '123456789012345678.000000000000000001');
  assert.deepEqual(historyChartPriceTicks([{ newPriceFormatted: '1' }, { newPriceFormatted: '2' }]).map((t) => t.price), ['2.00', '1.75', '1.50', '1.25', '1.00']);
});

test('Recharts line chart keeps accessible selection, exact ticks, and theme gradients', () => {
  const chart = read('../src/components/price-history/PriceHistoryGraph.jsx');
  const css = read('../src/assets/styles/price-history.css');
  assert.match(chart, /ResponsiveContainer/);
  assert.match(chart, /ComposedChart/);
  assert.match(chart, /<Line/);
  assert.match(chart, /<Area/);
  assert.match(chart, /<Tooltip/);
  assert.match(chart, /onMouseEnter=\{choosePoint\}/);
  assert.match(chart, /onKeyDown=/);
  assert.match(chart, /aria-pressed=/);
  assert.match(chart, /linearGradient/);
  assert.match(chart, /normalizedPrice: 100 - point\.y/);
  assert.match(chart, /historyChartPriceTicks/);
  assert.doesNotMatch(chart, /Prices come from applied database updates and confirmed blockchain updates/);
  assert.match(css, /price-history-chart__point:focus-visible/);
  assert.match(css, /price-history-chart__plot/);
  assert.match(css, /prefers-reduced-motion/);
});
