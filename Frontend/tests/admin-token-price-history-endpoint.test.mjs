import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  normalizePriceHistoryQuery, normalizePriceHistoryResponse, assertPriceHistoryAssetMatch,
  displayHistoryChartPrice, historyChartTooltipPrice,
} from '../src/services/price-history/priceHistory.utils.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const apiSource = read('src/api/admin/adminMonitoring.api.js');
const historyView = read('src/components/admin/AdminTokenPriceHistory.jsx');
const dialog = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');

const createAPI = (get) => {
  const script = apiSource.replace(/^import .*?;\s*$/gm, '').replaceAll('export const ', 'const ');
  return vm.runInNewContext(`${script}\nadminMonitoringApi;`, {
    apiClient: { get }, Number, String, Object, Array, Math, encodeURIComponent,
    normalizePriceHistoryQuery, normalizePriceHistoryResponse, assertPriceHistoryAssetMatch,
  });
};

test('admin price history uses UID in URL, authenticated client, no selected chain header, and backend paging', async () => {
  const requests = [];
  const api = createAPI(async (url, options) => {
    requests.push({ url, options });
    return { data: {
      data: [{ tokenUid: 'token/one', priceUpdateUid: 'price1', status: 'CONFIRMED', newPriceFormatted: '6.0000' }],
      meta: { pagination: { page: 3, limit: 5, total: 31, totalPages: 7 } },
    } };
  });
  const result = await api.getTokenPriceHistory('token/one', {
    page: 3, limit: 5, source: 'automated', status: 'CONFIRMED', search: ' Alice ',
    tokenUid: 'evil', chainUid: 'wrong', foo: 'unexpected',
  });
  assert.equal(requests[0].url, '/admin/tokens/token%2Fone/price-history');
  assert.equal(requests[0].options.skipSelectedChainHeader, true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].options.params)), {
    page: 3, limit: 5, source: 'automated', status: 'CONFIRMED', search: 'Alice',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.pagination)), { page: 3, limit: 5, total: 31, totalPages: 7 });
  assert.equal(result.items[0].newPriceFormatted, '6.0000');
});

test('admin history input is normalized safely without modifying issuer/investor query contracts', async () => {
  const calls = [];
  const api = createAPI(async (url, options) => {
    calls.push({ url, ...options.params });
    return { data: { data: [], meta: { pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } } };
  });
  const result = await api.getTokenPriceHistory('uid', { page: -3, limit: 400, source: 'bogus', status: 'UNKNOWN', search: 'A'.repeat(110) });
  assert.deepEqual({ page: calls[0].page, limit: calls[0].limit, source: calls[0].source, status: calls[0].status }, { page: 1, limit: 100, source: 'all', status: 'all' });
  assert.equal(calls[0].search.length, 100);
  assert.deepEqual(Array.from(result.items), []);
  assert.equal(result.pagination.totalPages, 0);
});

test('history rejects a response scoped to a different token, and propagates permission errors', async () => {
  const mismatch = createAPI(async () => ({ data: { data: [{ tokenUid: 'different' }], meta: { pagination: {} } } }));
  await assert.rejects(() => mismatch.getTokenPriceHistory('selected'), /different investment/);
  const denied = createAPI(async () => { const error = new Error('Forbidden'); error.status = 403; throw error; });
  await assert.rejects(() => denied.getTokenPriceHistory('selected'), /Forbidden/);
});

test('history UI uses unfiltered admin history and server pagination, five table records and default chart', () => {
  assert.match(historyView, /useState\('chart'\)/);
  assert.match(historyView, /HISTORY_PAGE_SIZE = 5/);
  assert.match(historyView, /CHART_QUERY_LIMIT = 100/);
  assert.match(historyView, /requestPage = view === 'table' \? page : 1/);
  assert.match(historyView, /setPage\(1\)/);
  assert.match(historyView, /getTokenPriceHistory\(tokenUid,/);
  assert.match(historyView, /source: 'all', status: 'all', search: ''/);
  assert.doesNotMatch(historyView, /Search price history|Price update source|Price update status|Search price updates/);
  assert.match(historyView, /price-history-list/);
  assert.match(historyView, /price-history-chart__plot/);
  assert.match(historyView, /PRICE_GRAPH_RANGES/);
  assert.match(historyView, /pagination\.totalPages/);
  assert.match(historyView, /PriceHistoryStatusChip/);
  assert.match(historyView, /PriceHistoryMethodChip/);
  assert.match(historyView, /priceHistoryGraphRows/);
  assert.doesNotMatch(historyView, /fetchRecentPublicPriceEvents|publicRpcUrl|eth_getLogs/);
  assert.match(dialog, /<AdminTokenPriceHistory token=\{token\} tokenUid=\{tokenUid\}/);
});

test('high precision tooltip remains exact while chart labels use threshold', () => {
  assert.equal(historyChartTooltipPrice('6.123456789012345678'), '6.123456789012345678');
  assert.equal(historyChartTooltipPrice('6'), '6');
  assert.equal(displayHistoryChartPrice('350.12'), '350');
});
