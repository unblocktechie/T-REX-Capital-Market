import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMonitoringFilterState,
  updateMonitoringFilterState,
  DEFAULT_MONITORING_FILTERS,
} from '../src/pages/admin/adminMonitoringFilters.js';

const component = readFileSync(new URL('../src/pages/admin/AdminMonitoringListsPage.jsx', import.meta.url), 'utf8');

test('filter state is independent for Investors, Tokens and Investor Applications', () => {
  let state = createMonitoringFilterState();
  state = updateMonitoringFilterState(state, 'investors', { status: 'draft', chainUid: 'arbitrum-uid', search: 'alice', page: 3 });
  assert.deepEqual(state.tokens, DEFAULT_MONITORING_FILTERS);
  assert.deepEqual(state.applications, DEFAULT_MONITORING_FILTERS);

  state = updateMonitoringFilterState(state, 'tokens', { status: 'deployed', chainUid: 'robinhood-uid', search: 'token', page: 2 });
  assert.equal(state.investors.status, 'draft');
  assert.equal(state.investors.chainUid, 'arbitrum-uid');
  assert.equal(state.investors.page, 3);
  assert.equal(state.applications.status, 'all');

  state = updateMonitoringFilterState(state, 'applications', { status: 'registered', chainUid: 'sepolia-uid', page: 4 });
  assert.equal(state.tokens.status, 'deployed');
  assert.equal(state.applications.status, 'registered');
  assert.equal(state.applications.chainUid, 'sepolia-uid');
  assert.equal(state.investors.search, 'alice');
});

test('Clear filters resets only the selected page, including pagination', () => {
  let state = createMonitoringFilterState();
  state = updateMonitoringFilterState(state, 'investors', { status: 'draft', chainUid: 'arbitrum', page: 5 });
  state = updateMonitoringFilterState(state, 'tokens', { status: 'deployed', chainUid: 'robinhood', page: 4 });
  state = updateMonitoringFilterState(state, 'investors', { ...DEFAULT_MONITORING_FILTERS });
  assert.deepEqual(state.investors, DEFAULT_MONITORING_FILTERS);
  assert.deepEqual(state.tokens, { page: 4, search: '', status: 'deployed', chainUid: 'robinhood' });
  assert.deepEqual(state.applications, DEFAULT_MONITORING_FILTERS);
});

test('new monitoring routes have distinct filter objects', () => {
  const state = createMonitoringFilterState();
  assert.notStrictEqual(state.investors, state.tokens);
  assert.notStrictEqual(state.tokens, state.applications);
  assert.notStrictEqual(state.investors, state.applications);
});

test('React route changes remount debounce and use the current page filter keys', () => {
  assert.match(component, /<AdminMonitoringListContent key=\{kind\}/);
  assert.match(component, /const \{ page, search, status, chainUid \} = filters/);
  assert.match(component, /useDebounce\(search, 350\)/);
  assert.match(component, /queryKey: \['admin','monitoring',kind,params\]/);
  assert.match(component, /onClear=\{clearFilters\}/);
  assert.match(component, /onPageChange=\{setPage\}/);
});
