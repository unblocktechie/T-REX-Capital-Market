import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reconcileInvestmentHistory } from '../src/utils/investmentHistoryReconciliation.js';

const page = readFileSync(new URL('../src/pages/investor-portal/PurchaseTokenPage.jsx', import.meta.url), 'utf8');
const hash = `0x${'a'.repeat(64)}`;
const otherHash = `0x${'b'.repeat(64)}`;
const recent = { paymentTxHash: hash, canonicalStatus: 'SUBMITTED', tokenAmount: '100', usdtAmount: '0.05' };
const opts = { page: 1, search: '', status: 'all', limit: 5 };

test('immediately displays the wallet-submitted investment when the activity API is still empty', () => {
  const result = reconcileInvestmentHistory([], recent, opts);
  assert.deepEqual(result.rows, [recent]);
  assert.equal(result.recentRowAdded, true);
  assert.equal(result.needsReconciliation, true);
});

test('shows Confirmed only after backend confirmation and preserves the exact transaction details', () => {
  const confirmed = { ...recent, canonicalStatus: 'CONFIRMED' };
  const result = reconcileInvestmentHistory([], confirmed, opts);
  assert.equal(result.rows[0].canonicalStatus, 'CONFIRMED');
  assert.equal(result.rows[0].tokenAmount, '100');
  assert.equal(result.rows[0].paymentTxHash, hash);
  assert.equal(result.recentRowAdded, true);
});

test('backend history row wins over local row by transaction hash (case insensitive)', () => {
  const canonical = { paymentTxHash: hash.toUpperCase().replace('0X', '0x'), canonicalStatus: 'CONFIRMED' };
  const result = reconcileInvestmentHistory([canonical], recent, opts);
  assert.deepEqual(result.rows, [canonical]);
  assert.equal(result.recentRowAdded, false);
  assert.equal(result.needsReconciliation, false);
});

test('keeps previous rows visible and enforces page size', () => {
  const original = Array.from({ length: 5 }, (_, i) => ({ paymentTxHash: otherHash, id: i }));
  const result = reconcileInvestmentHistory(original, recent, opts);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[0], recent);
  assert.equal(result.rows[1], original[0]);
});

test('does not insert local row into filtered searches, other pages, or nonmatching status', () => {
  for (const overrides of [
    { search: 'unrelated' }, { page: 2 }, { status: 'CONFIRMED' }, { status: 'FAILED' },
  ]) {
    const result = reconcileInvestmentHistory([], recent, { ...opts, ...overrides });
    assert.deepEqual(result.rows, []);
    assert.equal(result.recentRowAdded, false);
    assert.equal(result.needsReconciliation, true);
  }
  assert.equal(reconcileInvestmentHistory([], { ...recent, canonicalStatus: 'CONFIRMED' }, { ...opts, status: 'CONFIRMED' }).rows.length, 1);
});

test('does not invent a transaction or confirmed status without a valid tx hash and canonical state', () => {
  for (const invalid of [null, {}, { ...recent, paymentTxHash: '0x123' }, { ...recent, canonicalStatus: '' }]) {
    const result = reconcileInvestmentHistory([], invalid, opts);
    assert.deepEqual(result.rows, []);
    assert.equal(result.needsReconciliation, false);
  }
});

test('refreshes the history after wallet submission and continues polling until backend indexing catches up', () => {
  assert.match(page, /setPurchase\(submittedPurchase\);\s*setLastSubmittedPurchase\(submittedPurchase\);\s*\/\/ Render the submitted transaction immediately[^]*?refreshPurchaseHistory\(\)/);
  assert.match(page, /reconciledHistory\.needsReconciliation/);
  assert.match(page, /historyNeedsPolling/);
  assert.match(page, /window\.setInterval\(poll, HISTORY_POLL_INTERVAL_MS\)/);
  assert.match(page, /window\.addEventListener\('focus', poll\)/);
  assert.match(page, /setPurchase\(confirmedPurchase\);\s*setLastSubmittedPurchase\(confirmedPurchase\)/);
  assert.match(page, /\{displayedPurchaseHistory\.map\(/);
  assert.match(page, /if \(\[PURCHASE_STATUS\.COMPLETED, PURCHASE_STATUS\.EXPIRED\]\.includes\(purchaseStatus\)\)/);
});
