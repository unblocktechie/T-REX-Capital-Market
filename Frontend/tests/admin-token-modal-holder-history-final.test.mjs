import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminHolderStatus, formatAdminHolderBalance } from '../src/utils/adminHolderDisplay.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dialog = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const history = read('src/components/admin/AdminTokenPriceHistory.jsx');
const api = read('src/api/admin/adminMonitoring.api.js');
const token = dialog.slice(dialog.indexOf('export function AdminTokenDetailsDialog'), dialog.indexOf('const sortEvents'));

test('holder balances retain contract decimal strings; unknown never becomes zero', () => {
  assert.equal(formatAdminHolderBalance('0.000000000000000001'), '0.000000000000000001');
  assert.equal(formatAdminHolderBalance('1500000000000.123456789012345678'), '1,500,000,000,000.123456789012345678');
  assert.equal(formatAdminHolderBalance(null), 'Unavailable');
  assert.equal(adminHolderStatus({ holderStatus: 'FORMER', currentTokenBalanceRaw: '0' }), 'FORMER');
  assert.equal(adminHolderStatus({ holderStatus: 'UNKNOWN', currentTokenBalanceRaw: null }), 'UNKNOWN');
  assert.equal(adminHolderStatus({ currentTokenBalanceRaw: '0' }), 'UNKNOWN');
});

test('responsive holder status columns and copied wallet survive the redesign without the balance tooltip', () => {
  assert.match(token, /modalSortHeading\('Current balance'/);
  assert.match(token, /modalSortHeading\('Holding status'/);
  assert.match(token, /<dt[^>]*>Current balance</);
  assert.match(token, /<dt[^>]*>Holding status</);
  assert.doesNotMatch(dialog, /Full balance:|Raw balance:|Block hash:|Balance verification information/);
  assert.doesNotMatch(dialog, /<ResponsiveTooltip|<Info /);
  assert.match(token, /<AdminAddressPill value=\{investor.walletAddress\}/);
  assert.match(token, /onChange=\{\(value\) => \{ setHolderStatus\(value\); setPage\(1\); \}\}/);
  assert.doesNotMatch(token, /<HolderSummary|rounded-full bg-slate-100 px-2 py-0\.5/);
});

test('wide modal uses the responsive shared Modal; only one active history refresh control remains', () => {
  assert.match(token, /maxWidth: '1200px'/);
  assert.match(token, /sm:max-w-\[1200px\]/);
  assert.match(token, /queryClient\.invalidateQueries\(\{ queryKey: \['admin', 'token-price-history', tokenUid\]/);
  assert.doesNotMatch(history, /Search price updates|All sources|All statuses|RefreshCcw/);
});

test('price history shares chart and table styling without switching away from admin API', () => {
  assert.match(history, /price-history-chart__plot-scroll/);
  assert.match(history, /price-history-chart__details/);
  assert.match(history, /price-history-row/);
  assert.match(history, /price-history-pagination__page/);
  assert.match(history, /PRICE_GRAPH_RANGES/);
  assert.match(history, /CHART_QUERY_LIMIT = 100/);
  assert.match(history, /HISTORY_PAGE_SIZE = 5/);
  assert.match(history, /source: 'all', status: 'all', search: ''/);
  assert.match(history, /historyChartTooltipPrice/);
  assert.match(history, /displayHistoryChartPrice/);
  assert.match(api, /getTokenPriceHistory: async/);
  assert.doesNotMatch(history, /fetchRecentPublicPriceEvents|eth_getLogs/);
});


test('admin history uses text-only prices, right-aligned switch, and circular pagination', () => {
  const css = read('src/assets/styles/price-history.css');
  assert.doesNotMatch(history, /<TokenIcon|from ['"]@\/components\/common\/TokenIcon/);
  assert.match(history, /price-history-panel--admin/);
  assert.match(history, /price-history-chart__toolbar admin-history-controls/);
  assert.match(history, /ml-auto inline-flex flex-wrap/);
  assert.doesNotMatch(history, /price-history-chart__legend-item is-line/);
  assert.match(history, /rounded-full border border-slate-200 bg-white px-3 text-sm/);
  assert.match(css, /\.price-history-panel--admin \.price-history-pagination__page\s*\{/);
  assert.match(css, /border-radius:\s*50%/);
  assert.match(history, /<HistoryPrice value=\{row.oldPriceFormatted\}/);
  assert.match(history, /<HistoryPrice value=\{row.newPriceFormatted\}/);
  assert.match(history, /<PriceHistoryChangeIndicator/); // existing direction behavior remains intact
});
