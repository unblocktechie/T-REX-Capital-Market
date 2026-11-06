import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historyChartDayTicks } from '../src/services/price-history/priceHistory.utils.js';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('each day is labelled at its first recorded update, not the middle of its points', () => {
  const points = [
    { index: 0, time: '2026-10-14T10:00:00Z' },
    { index: 20, time: '2026-10-14T15:35:00Z' },
    { index: 40, time: '2026-10-15T11:10:00Z' },
    { index: 60, time: '2026-10-15T13:10:00Z' },
    { index: 100, time: '2026-10-16T10:42:00Z' },
  ];
  const days = historyChartDayTicks(points);
  assert.equal(days.length, 3);
  assert.deepEqual(days.map((day) => day.index), [0, 40, 100]);
  assert.deepEqual(days.map((day) => day.label), ['Oct 14', 'Oct 15', 'Oct 16']);
});


test('first recorded point retains its date label, even with several later updates on that day', () => {
  const points = [
    { index: 0, time: '2026-10-14T15:35:00Z' },
    { index: 100 / 6, time: '2026-10-14T16:20:00Z' },
    { index: 100 / 3, time: '2026-10-14T18:00:00Z' },
    { index: 50, time: '2026-10-15T11:10:00Z' },
    { index: 200 / 3, time: '2026-10-15T11:12:00Z' },
    { index: 250 / 3, time: '2026-10-15T12:00:00Z' },
    { index: 100, time: '2026-10-16T10:42:00Z' },
  ];
  assert.deepEqual(historyChartDayTicks(points), [
    { index: 0, label: 'Oct 14' },
    { index: 50, label: 'Oct 15' },
    { index: 100, label: 'Oct 16' },
  ]);
});

test('single-day data, invalid dates, and invalid coordinates are handled safely', () => {
  assert.deepEqual(historyChartDayTicks([]), []);
  assert.deepEqual(historyChartDayTicks([
    { index: 50, time: '2026-10-15T10:10:00Z' },
    { index: NaN, time: '2026-10-15T11:00:00Z' },
    { index: 30, time: 'invalid' },
  ]).map(({ index, label }) => ({ index, label })), [{ index: 50, label: 'Oct 15' }]);
});

test('shared Recharts graph shows per-day X labels and a top-positioned, readable tooltip', () => {
  const graph = read('../src/components/price-history/PriceHistoryGraph.jsx');
  const css = read('../src/assets/styles/price-history.css');
  assert.match(graph, /historyChartDayTicks\(chartData\)/);
  assert.match(graph, /ticks=\{dayTicks\.map/);
  assert.match(graph, /tickFormatter=\{\(value\) => dayLabels\.get\(value\)/);
  assert.match(graph, /tickMargin=\{14\} height=\{46\}/);
  assert.match(graph, /interval="preserveStartEnd"/);
  assert.match(graph, /position=\{\{ y: 6 \}\}/);
  assert.doesNotMatch(graph, /price-history-chart__axis"><span>/);
  assert.match(css, /\.price-history-chart__day-tick/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /price-history-chart__plot \{ height: 285px; \}/);
});

test('issuer and investor both use the shared Recharts graph', () => {
  assert.match(read('../src/pages/tokens/TokenPriceHistoryPage.jsx'), /<PriceHistoryGraph/);
  assert.match(read('../src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx'), /<PriceHistoryGraph/);
});
