import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dialogs = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const listing = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const asset = dialogs.slice(dialogs.indexOf('function TokenOverview('), dialogs.indexOf('// Same icon style'));
const timeline = dialogs.slice(dialogs.indexOf('export function AdminApplicationHistoryDialog'));

test('Investor Accounts details link matches the blue organization-details action, without changing name links', () => {
  assert.match(listing, /const detailsLinkClass = '[^']*text-blue-700[^']*hover:text-blue-900/);
  assert.match(listing, /key: 'action', title: 'Details', render: \(r\) => <Link className=\{detailsLinkClass\}/);
  assert.match(listing, /key: 'investor'[\s\S]*?text-slate-950 transition-colors hover:text-blue-700/);
});

test('Token overview places the copy-only Token address at bottom right within the blue asset header', () => {
  assert.match(asset, /<StateChip value=\{token\.status\}/);
  assert.match(asset, /\{chainName\}/);
  assert.match(asset, /grid-cols-1[^"']*lg:grid-cols-4/);
  assert.ok(asset.indexOf('>Token</span>') < asset.indexOf('lg:grid-cols-4'), 'the Token address should remain inside the blue header, before the metric grid');
  assert.match(asset, /flex-col items-end justify-between gap-4 self-stretch sm:w-auto sm:shrink-0/);
  assert.doesNotMatch(asset, /border-t border-blue-100 bg-white px-4 py-3/);
  assert.match(asset, /<CompactAddress value=\{token\.tokenAddress\} label="Token address"/);
  assert.doesNotMatch(asset, /<span[^>]*>Token contract<\/span>/);
});

test('Application timeline header includes issuer link, network/status chips and a copy-only Token address within the blue area', () => {
  assert.match(timeline, /Investment asset<\/p>/);
  assert.match(timeline, /getApplicationTokenContractUrl\(history, application, resolvedToken, explorerBase\)/);
  assert.match(timeline, /issuerOrganizationUid \? <Link/);
  assert.match(timeline, /to=\{ROUTES\.adminOrganizationReview\(encodeURIComponent\(issuerOrganizationUid\)\)\}/);
  assert.match(timeline, /state=\{\{ from: location\.pathname \}\}/);
  assert.match(timeline, /networkName && <span[^>]*bg-blue-100[^>]*>\{networkName\}<\/span>/);
  assert.match(timeline, /<StateChip value=\{history\.status \|\| history\.summary\?\.status\}/);
  assert.match(timeline, /<CompactAddress value=\{tokenAddress\} label="Token address"/);
  assert.match(timeline, /flex-col items-end justify-between gap-4 self-stretch sm:w-auto sm:shrink-0/);
  assert.doesNotMatch(timeline, /border-t border-blue-100 bg-white px-4 py-3/);
  assert.doesNotMatch(timeline, /href=\{tokenContractUrl\}[^>]*Token address/s);
});

test('Application network chip resolves the recorded chain, not a selected-wallet chain', () => {
  const source = dialogs.slice(dialogs.indexOf('const applicationChainName = '), dialogs.indexOf('const applicationIssuerName = '));
  const ctx = {
    getChainRecordById: (id) => Number(id) === 46630 ? {chainId: 46630, chainName: 'ROBINHOOD'} : undefined,
    getChainRecordByUid: () => undefined,
  };
  const resolver = vm.runInNewContext(`${source}\napplicationChainName`, ctx);
  const chains = [
    {chainUid: 'arc', chainId: 5042002, chainName: 'ARC'},
    {chainUid: 'robinhood', chainId: 46630, chainName: 'ROBINHOOD'},
  ];
  assert.equal(resolver({chainId: 46630}, {chainId: 5042002}, {}, chains), 'ROBINHOOD');
  assert.equal(resolver({}, {chainUid: 'arc'}, {}, chains), 'ARC');
  assert.equal(resolver({chainName: 'Robinhood'}, {}, {}, []), 'Robinhood');
  assert.equal(resolver({}, {}, {}, []), '');
});
