import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { adminTokenCreatedDate, adminTokenCurrentHolders } from '../src/utils/adminTokenListDisplay.js';

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = file('src/api/admin/adminMonitoring.api.js');
const list = file('src/pages/admin/AdminMonitoringListsPage.jsx');
const dialog = file('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const history = file('src/components/admin/AdminTokenPriceHistory.jsx');

test('token sorting forwards supported server fields; excludes unknown fields from requests', () => {
  const source = api.replace(/^import .*?;\s*$/gm, '').replaceAll('export const ', 'const ');
  const params = vm.runInNewContext(`${source}\nmonitoringListParams;`, { apiClient: {}, Number, String, Object, Math, Array, encodeURIComponent });
  assert.deepEqual(JSON.parse(JSON.stringify(params('tokens', { sortBy: 'tokenName', sortOrder: 'asc', page: 2 }))), { page: 2, limit: 20, sortBy: 'tokenName', sortOrder: 'asc' });
  assert.equal(params('tokens', { sortBy: 'currentHolders', sortOrder: 'desc' }).sortOrder, 'desc');
  assert.equal(params('tokens', { sortBy: 'evil; DROP TABLE', sortOrder: 'desc' }).sortBy, undefined);
  assert.equal(params('investors', { sortBy: 'tokenName' }).sortBy, undefined);
});

test('server holder counts and dates do not invent missing values', () => {
  assert.equal(adminTokenCurrentHolders({ holderSummary: { currentHolders: 0 } }), '0');
  assert.equal(adminTokenCurrentHolders({ currentHolders: 8 }), '8');
  assert.equal(adminTokenCurrentHolders({}), '—');
  assert.equal(adminTokenCreatedDate('not-a-date'), '—');
});

test('platform tokens use sortable headings, full-date tooltips and token address copying', () => {
  assert.match(list, /tokenSortHeading\('Token', 'tokenName'/);
  assert.match(list, /onTokenSort/);
  assert.match(list, /sortOrder: sortBy === key && sortOrder === 'asc' \? 'desc' : 'asc'/);
  assert.match(list, /currentTokenPrice/);
  assert.match(list, /Current holders/);
  assert.match(list, /AdminAddressPill value=\{token\.tokenAddress\}/);
  assert.match(list, /title=\{r\.createdAt \? when\(r\.createdAt\) : undefined\}/);
  assert.doesNotMatch(list, /Price \(initial → current\)/);
  assert.doesNotMatch(list, /Prices show meaningful decimals for small amounts/);
});

test('token details restore holder balances and statuses without payment icons in the banner', () => {
  assert.match(dialog, /<HolderStatus investor=\{investor\}/);
  assert.match(dialog, /<HolderBalance investor=\{investor\} token=\{token\}/);
  assert.doesNotMatch(dialog, /<HolderSummary|<TokenIcon/);
  assert.match(dialog, /adminNetworkApi\.listPaymentTokens/);
  assert.match(dialog, /token\.initialTokenPriceAt/);
  assert.match(dialog, /token\.currentTokenPriceAt/);
  assert.match(dialog, /tab === 'history'/);
});

test('history defaults to chart, uses authenticated API and pages five per table', () => {
  assert.match(history, /useState\('chart'\)/);
  assert.match(history, /const HISTORY_PAGE_SIZE = 5/);
  assert.match(history, /displayHistoryChartPrice/);
  assert.match(history, /historyChartTooltipPrice/);
  assert.match(history, /adminMonitoringApi\.getTokenPriceHistory/);
  assert.doesNotMatch(history, /fetchRecentPublicPriceEvents|publicRpcUrl/);
  assert.match(history, /aria-label="Price update pages"/);
  assert.match(history, /PriceHistoryStatusChip/);
  assert.match(history, /PriceHistoryMethodChip/);
});
