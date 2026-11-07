import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const apiSource = read('src/api/admin/adminMonitoring.api.js');
const dialog = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const tokenDialog = dialog.slice(dialog.indexOf('export function AdminTokenDetailsDialog'), dialog.indexOf('const sortEvents'));
const loadApi = (get) => {
  const source = apiSource.replace(/^import .*?;\s*$/gm, '').replaceAll('export const ', 'const ');
  return vm.runInNewContext(`${source}\nadminMonitoringApi;`, { apiClient: { get }, Number, String, Object, Math, Array, encodeURIComponent });
};
test('holder status and exact balances are restored without reintroducing summary cards', async () => {
  const calls = [];
  const api = loadApi(async (url, options) => {
    calls.push({ url, options });
    return { data: { data: { token: { tokenUid: 'one' }, investors: [{ walletAddress: '0x1' }] }, meta: { pagination: { page: 2, limit: 5, total: 9, totalPages: 2 } } } };
  });
  const result = await api.getTokenDetails('a/b', { page: 2, limit: 5, search: ' Alice ', holderStatus: 'former', chainUid: 'not-selected-chain' });
  assert.equal(calls[0].url, '/admin/tokens/a%2Fb');
  assert.equal(calls[0].options.skipSelectedChainHeader, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.params)), { page: 2, limit: 5, search: 'Alice', holderStatus: 'former' });
  assert.equal(result.pagination.total, 9);
  assert.equal(result.investors.length, 1);
  assert.match(tokenDialog, /HolderBalance investor=\{investor\} token=\{token\}/);
  assert.match(tokenDialog, /HolderStatus investor=\{investor\}/);
  assert.match(tokenDialog, /MarketplaceDropdown value=\{holderStatus\}/);
  assert.doesNotMatch(tokenDialog, /<HolderSummary|rounded-full bg-slate-100 px-2 py-0\.5/);
  assert.match(tokenDialog, /AdminAddressPill value=\{investor.walletAddress\}/);
});
test('history tab still belongs to the selected token and preserves normal investor tabs', () => {
  assert.match(tokenDialog, /<AdminTokenPriceHistory token=\{token\} tokenUid=\{tokenUid\}/);
  assert.match(tokenDialog, /setTab\('investors'\)/);
  assert.doesNotMatch(tokenDialog, /setTab\('details'\)/);
  assert.match(tokenDialog, /<TokenOverview token={token}/);
  assert.match(tokenDialog, /setTab\('history'\)/);
});
