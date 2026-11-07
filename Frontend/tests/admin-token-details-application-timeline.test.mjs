import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const get = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = get('src/api/admin/adminMonitoring.api.js');
const listing = get('src/pages/admin/AdminMonitoringListsPage.jsx');
const dialogs = get('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const modal = get('src/components/ui/Modal.jsx');

test('admin token detail and application history endpoints use IDs and admin header isolation', () => {
  assert.match(api, /getTokenDetails:\s*async \(tokenUid, input = \{\}\)/);
  assert.match(api, /getApplicationHistory:\s*\(interestUid\)/);
  assert.match(api, /\/investor-applications\/\$\{encodeURIComponent\(interestUid\)\}\/history/);
  assert.match(api, /\/tokens\/\$\{encodeURIComponent\(tokenUid\)\}/);
  assert.match(api, /skipSelectedChainHeader: true/);
  assert.match(api, /data\.investors/);
  assert.match(api, /data\.token/);
  assert.match(api, /response\?\.data\?\.meta\?\.pagination/);
});

test('token details params include only page limit and investor search, never selected-chain/status filters', () => {
  assert.match(api, /const \{ page, limit, search \} = monitoringListParams\('investors', input\)/);
  assert.doesNotMatch(api, /params\.chainUid =/);
  const source = api.slice(api.indexOf('export const ADMIN_MONITORING_FILTERS'), api.indexOf('const unpack')).replaceAll('export const ', 'const ');
  const paramFn = vm.runInNewContext(`${source}\nmonitoringListParams;`);
  const params = paramFn('investors', {page: 2, limit: 250, search: ' Alice ', chainUid: 'arbitrum', status: 'pending'});
  assert.equal(params.page, 2);
  assert.equal(params.limit, 100);
  assert.equal(params.search, 'Alice');
});

test('token and application list actions preserve explorer and status labels', () => {
  assert.match(listing, /AdminTokenName token=\{r\} chains=\{chains\}/);
  assert.match(listing, /getTokenColumns = \(chains, onViewToken, sortBy, sortOrder, onSort, renderIssuer\)/);
  assert.match(listing, /onViewToken\(r\.tokenUid\)/);
  assert.match(listing, /onViewHistory\(r\)/);
  assert.match(listing, /selectedTokenUid/);
  assert.match(listing, /selectedInterestUid/);
  assert.match(listing, /<AdminTokenDetailsDialog/);
  assert.match(listing, /<AdminApplicationHistoryDialog/);
  assert.match(listing, /adminMonitoringApi\.listApplications/);
  assert.match(listing, /adminMonitoringApi\.listTokens/);
});

test('dialog accessibility, mobile, pagination, investor search and permission errors', () => {
  assert.match(dialogs, /trapFocus/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(dialogs, /sm:max-w-5xl/);
  assert.match(dialogs, /sm:max-w-5xl/);
  assert.match(dialogs, /TokenInvestorsPagination pagination=\{pagination\}/);
  assert.match(dialogs, /maxLength=\{100\}/);
  assert.match(dialogs, /useDebounce\(search, 350\)/);
  assert.match(dialogs, /getErrorMessage\(query\.error/);
  assert.match(dialogs, /role="alert"/);
  assert.match(dialogs, /overflow-x-auto/);
  assert.match(dialogs, /if \(!tokenUid\) return null/);
  assert.match(dialogs, /if \(!interestUid\) return null/);
});

test('application history is read-only and uses protected document viewer instead of unauthenticated links', () => {
  const investorDetails = get('src/pages/admin/AdminInvestorDetailPage.jsx');
  const viewer = get('src/components/admin/AdminApplicationDocumentViewer.jsx');
  assert.match(dialogs, /history\.timeline/);
  assert.match(dialogs, /event\.rejectReason/);
  assert.match(dialogs, /event\.resubmitAttempt/);
  assert.match(dialogs, /event\.actorRole/);
  assert.match(dialogs, /event\.documents/);
  assert.match(dialogs, /doc\.downloadUrl/);
  assert.match(dialogs, /setActiveDocument\(doc\)/);
  assert.match(dialogs, /AdminApplicationDocumentViewer interestUid/);
  assert.match(dialogs, /Back to timeline/);
  assert.match(investorDetails, /applicationHistoryColumn/);
  assert.match(investorDetails, /application\.interestUid/);
  assert.match(investorDetails, /<AdminApplicationHistoryDialog/);
  assert.match(investorDetails, /tab === 'applications' \? applicationColumns : tab === 'investedTokens' \? investedTokenColumns : chainColumns/);
  assert.match(viewer, /supportedPreviewType/);
  assert.match(viewer, /application\/pdf/);
  assert.match(viewer, /image\/png/);
  assert.doesNotMatch(viewer, /image\/svg\+xml/);
  assert.match(viewer, /URL\.revokeObjectURL/);
  assert.match(viewer, /sandbox="allow-downloads"/);
  assert.doesNotMatch(dialogs, /<a href=\{doc\.downloadUrl\}/);
});

test('document download URL is restricted to the admin API on this application', async () => {
  const calls = [];
  const mockClient = {
    defaults: { baseURL: 'https://api.example.test/api/v1' },
    get: async (url, options) => {
      calls.push({url, options});
      return {data: new Blob(['%PDF-1.4'], {type: 'application/pdf'}), headers: {'content-type':'application/pdf','content-disposition':`attachment; filename*=UTF-8''review%20doc.pdf`}};
    },
  };
  const source = api.replace(/^import .*?;\s*$/gm, '').replaceAll('export const ', 'const ');
  const methods = vm.runInNewContext(`${source}\n({ adminApplicationDocumentPath, adminDocumentFilename, adminMonitoringApi });`, {
    apiClient: mockClient, Number, String, Math, Array, Object, encodeURIComponent, decodeURIComponent, URL,
  });
  const expected = '/admin/investor-applications/app%2F1/documents/file%2F2/download';
  assert.equal(methods.adminApplicationDocumentPath('app/1', 'file/2', `https://api.example.test/api/v1${expected}`, mockClient.defaults.baseURL), expected);
  assert.equal(methods.adminApplicationDocumentPath('app/1', 'file/2', expected, mockClient.defaults.baseURL), expected);
  assert.equal(methods.adminApplicationDocumentPath('app/1', 'file/2', `https://evil.test/api/v1${expected}`, mockClient.defaults.baseURL), null);
  assert.equal(methods.adminApplicationDocumentPath('app/1', 'file/2', '/admin/investor-applications/different/documents/file%2F2/download', mockClient.defaults.baseURL), null);
  assert.equal(methods.adminApplicationDocumentPath('app/1', 'file/2', 'javascript:alert(1)', mockClient.defaults.baseURL), null);
  assert.equal(methods.adminDocumentFilename(`attachment; filename*=UTF-8''review%20doc.pdf`), 'review doc.pdf');
  const result = await methods.adminMonitoringApi.downloadApplicationDocument('app/1', {documentUid:'file/2', downloadUrl:expected});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, expected);
  assert.equal(calls[0].options.responseType, 'blob');
  assert.equal(calls[0].options.skipSelectedChainHeader, true);
  assert.equal(result.fileName, 'review doc.pdf');
  await assert.rejects(() => methods.adminMonitoringApi.downloadApplicationDocument('app/1', {documentUid:'file/2', downloadUrl:'https://evil.test/file'}));
  assert.equal(calls.length, 1);
});

test('API methods call the correct URLs with expected params and interpret the backend envelope', async () => {
  const calls = [];
  const mockClient = {
    get: async (url, options) => {
      calls.push({ url, options });
      return url.endsWith('/history')
        ? { data: { success: true, data: { interestUid: 'application-id', timeline: [{ id: 'e1', eventType: 'submitted' }] } } }
        : { data: { success: true, data: { token: { tokenUid: 'token-id' }, investors: [{ userUid: 'investor-id' }] }, meta: { pagination: { page: 2, limit: 10, total: 21, totalPages: 3 } } } };
    },
  };
  const executableSource = api.replace(/^import .*?;\s*$/gm, '').replaceAll('export const ', 'const ');
  const context = vm.createContext({ apiClient: mockClient, Number, String, Math, Array, Object, encodeURIComponent });
  const methods = vm.runInContext(`${executableSource}\nadminMonitoringApi;`, context);
  const token = await methods.getTokenDetails('a/b', { page: 2, limit: 10, search: ' Alice ', status: 'pending', chainUid: 'wrong-chain' });
  assert.equal(token.token.tokenUid, 'token-id');
  assert.equal(token.investors.length, 1);
  assert.equal(token.pagination.total, 21);
  assert.equal(token.pagination.totalPages, 3);
  assert.equal(calls[0].url, '/admin/tokens/a%2Fb');
  assert.equal(calls[0].options.skipSelectedChainHeader, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.params)), { page: 2, limit: 10, search: 'Alice', holderStatus: 'all' });
  const history = await methods.getApplicationHistory('id/one');
  assert.equal(calls[1].url, '/admin/investor-applications/id%2Fone/history');
  assert.equal(calls[1].options.skipSelectedChainHeader, true);
  assert.equal(history.timeline[0].eventType, 'submitted');
});


test('application activity dialog is wider while preserving mobile layout and secure document actions', () => {
  const activity = dialogs.slice(dialogs.indexOf('export function AdminApplicationHistoryDialog'));
  assert.match(activity, /className="sm:max-w-5xl" dialogStyle=\{\{ maxWidth: '960px' \}\}/);
  assert.match(activity, /bodyClassName="space-y-5 px-4 py-5 sm:px-6 lg:px-8"/);
  assert.match(activity, /min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5/);
  assert.match(activity, /md:flex-row md:items-center md:justify-between/);
  assert.match(activity, /min-h-10 w-full shrink-0/);
  assert.match(activity, /md:w-auto/);
  assert.match(activity, /AdminApplicationDocumentViewer interestUid/);
  assert.match(modal, /max-h-\[92dvh\]/);
  assert.match(modal, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(modal, /shrink-0 flex-col-reverse/);
});
