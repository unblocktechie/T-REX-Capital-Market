import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compareHistoryPrices, exactPriceText, priceHistoryMethod, priceHistoryStatus,
} from '../src/services/price-history/priceHistory.utils.js';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// All rendering uses the same helpers as the chart rather than coercing decimals to Number.
test('price direction is exact across changes smaller than two displayed decimals', () => {
  assert.equal(compareHistoryPrices('300.000000000000000001', '300'), 1);
  assert.equal(compareHistoryPrices('299.999999999999999999', '300'), -1);
  assert.equal(compareHistoryPrices('300', '300.000000000000000000'), 0);
  assert.equal(compareHistoryPrices('10', '15'), -1);
  assert.equal(compareHistoryPrices('350', '300'), 1);
  assert.equal(exactPriceText(null), '—');
});

test('methods and backend status types retain their real semantic meaning', () => {
  assert.equal(priceHistoryMethod({ updateType: 'MANUAL' }), 'Manual');
  assert.equal(priceHistoryMethod({ updateType: 'AUTOMATED' }), 'Automated (bot)');
  assert.equal(priceHistoryMethod({}), '—');
  for (const code of ['APPLIED', 'CONFIRMED']) assert.equal(priceHistoryStatus(code).tone, 'success');
  for (const code of ['PENDING', 'SUBMITTED']) assert.equal(priceHistoryStatus(code).tone, 'warning');
  for (const code of ['FAILED', 'ORPHANED', 'EXPIRED']) assert.equal(priceHistoryStatus(code).tone, 'danger');
  assert.equal(priceHistoryStatus('CANCELLED').tone, 'info');
  assert.equal(priceHistoryStatus('EXPIRED').text, 'EXPIRED');
  assert.equal(priceHistoryStatus('CANCELLED').text, 'CANCELLED');
  assert.equal(priceHistoryStatus('  cancelled  ').text, 'CANCELLED');
  assert.equal(priceHistoryStatus('canceled').text, 'CANCELLED');
  assert.equal(priceHistoryStatus(null).tone, 'neutral');
});

test('shared indicators show only real direction, not rounded or unknown price changes', () => {
  const indicators = read('../src/components/price-history/PriceHistoryIndicators.jsx');
  assert.match(indicators, /exactPriceText\(previous\) === '—'/);
  assert.match(indicators, /exactPriceText\(current\) === '—'/);
  assert.match(indicators, /compareHistoryPrices\(current, previous\)/);
  assert.match(indicators, /direction === 0\) return null/);
  assert.match(indicators, /const Icon = rising \? ArrowUp : ArrowDown/);
  assert.match(indicators, /aria-label=\{description\}/);
  assert.match(indicators, /priceHistoryStatus\(status\)/);
  assert.match(indicators, /priceHistoryMethod\(row\)/);
  assert.match(indicators, /does not prove who signed it/);
  assert.match(indicators, /const method = onchain \? 'Manual' : priceHistoryMethod\(row\)/);
});

test('cancelled records render a Cancelled chip and method/status chips contain text only', () => {
  const indicators = read('../src/components/price-history/PriceHistoryIndicators.jsx');
  const method = indicators.split('export function PriceHistoryMethodChip')[1].split('export function PriceHistoryStatusChip')[0];
  const status = indicators.split('export function PriceHistoryStatusChip')[1].split('export function PriceHistoryChangeIndicator')[0];
  const css = read('../src/assets/styles/price-history.css');
  assert.match(indicators, /CANCELLED: 'Cancelled'/);
  assert.match(indicators, /EXPIRED: 'Expired'/);
  assert.match(indicators, /CANCELLED: 'Price update request was cancelled'/);
  assert.match(status, /const code = detail\.text/);
  assert.match(status, /const label = STATUS_LABELS\[code\] \|\| 'Unknown'/);
  assert.match(method, />\s*\{method\}\s*<\/span>/);
  assert.match(status, />\s*\{label\}\s*<\/span>/);
  for (const chip of [method, status]) {
    assert.doesNotMatch(chip, /<(?:Icon|svg)\b/);
    assert.doesNotMatch(chip, /aria-hidden=/);
  }
  assert.doesNotMatch(css, /\.price-history-chip svg/);
  // Do not remove the arrows next to increasing/decreasing prices.
  assert.match(indicators, /const Icon = rising \? ArrowUp : ArrowDown/);
});

test('issuer/investor shared table and public on-chain table show status immediately following method', () => {
  const shared = read('../src/components/price-history/IssuerPriceHistory.jsx');
  const publicEvents = read('../src/components/price-history/InvestorOnchainPriceHistory.jsx');
  for (const source of [shared, publicEvents]) {
    assert.match(source, /<span>Method<\/span><span>Status<\/span><span>Transaction<\/span>/);
    assert.match(source, /data-label="New price"/);
    assert.match(source, /<PriceHistoryChangeIndicator previous=\{row\.oldPriceFormatted\} current=\{row\.newPriceFormatted\}/);
    assert.match(source, /data-label="Status"/);
  }
  assert.match(shared, /<PriceHistoryChangeIndicator[^>]*status=\{row\.status\}/);
  assert.match(publicEvents, /<PriceHistoryChangeIndicator[^>]*status="CONFIRMED"/);
  assert.match(shared, /<PriceHistoryStatusChip status=\{row\.status\}/);
  assert.match(publicEvents, /<PriceHistoryMethodChip onchain/);
  assert.match(publicEvents, /<PriceHistoryStatusChip status="CONFIRMED"/);
});

test('price arrows appear only when the backend reports a confirmed update', () => {
  const indicators = read('../src/components/price-history/PriceHistoryIndicators.jsx');
  const direction = indicators.split('export function PriceHistoryChangeIndicator')[1];
  assert.match(direction, /\(\{ previous, current, status \}\)/);
  assert.match(direction, /if \(priceHistoryStatus\(status\)\.text !== 'CONFIRMED'\) return null/);
  // Use the same status normalization as the badge: case-insensitive,
  // with only CONFIRMED eligible (APPLIED is intentionally excluded).
  for (const status of ['PENDING', 'SUBMITTED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'FAILED', 'ORPHANED', 'APPLIED', 'UNKNOWN', null]) {
    assert.notEqual(priceHistoryStatus(status).text, 'CONFIRMED');
  }
  for (const status of ['CONFIRMED', 'confirmed', ' Confirmed ']) {
    assert.equal(priceHistoryStatus(status).text, 'CONFIRMED');
  }
  // The indicator still handles zero changes or missing values as before.
  assert.match(direction, /exactPriceText\(previous\) === '—'/);
  assert.match(direction, /direction === 0\) return null/);
});

test('the status and method chips use theme-aware colors and fit narrow containers', () => {
  const css = read('../src/assets/styles/price-history.css');
  assert.match(css, /container: price-history-table \/ inline-size/);
  assert.match(css, /@container price-history-table \(max-width: 950px\)/);
  assert.match(css, /@container price-history-table \(max-width: 440px\)/);
  assert.match(css, /price-history-method--manual/);
  assert.match(css, /price-history-method--automated/);
  assert.match(css, /price-history-method--onchain/);
  assert.match(css, /price-history-status--success/);
  assert.match(css, /price-history-status--warning/);
  assert.match(css, /price-history-status--danger/);
  assert.match(css, /price-history-status--info/);
  assert.match(css, /price-history-direction--up/);
  assert.match(css, /price-history-direction--down/);
  assert.match(css, /var\(--surface\)/);
});
