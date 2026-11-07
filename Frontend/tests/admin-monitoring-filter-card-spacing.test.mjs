import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lists = readFileSync(new URL('../src/pages/admin/AdminMonitoringListsPage.jsx', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../src/components/admin/AdminMonitoringParts.jsx', import.meta.url), 'utf8');

test('Investor Applications no longer shows technical review-only explanation', () => {
  assert.doesNotMatch(lists, /means status\s*<code>submitIntrest<\/code>/);
  assert.doesNotMatch(lists, /investor-side document tasks are not included/);
  assert.match(lists, /value: 'submitIntrest', label: 'Awaiting issuer review'/);
});

test('Investor Accounts and Investor Applications filter cards have compact spacing', () => {
  assert.doesNotMatch(lists, /hasFooterNote=\{kind === 'tokens'\}/);
  assert.match(tools, /hasFooterNote = false/);
  assert.match(tools, /hasFooterNote \? "mb-4 border-b border-slate-100 pb-4" : ""/);
  assert.doesNotMatch(tools, /className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5"/);
});

test('Platform Tokens removes the extra price explanation but keeps filters and controls', () => {
  assert.doesNotMatch(lists, /Prices show meaningful decimals for small amounts/);
  assert.match(lists, /<ListTools search=\{search\}/);
  assert.match(lists, /onClear=\{clearFilters\}/);
  assert.match(lists, /onRefresh=\{\(\) => query\.refetch\(\)\}/);
  assert.match(tools, /Clear filters/);
  assert.match(tools, />Refresh<\/button>/);
});
