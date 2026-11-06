import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const detail = source('pages/admin/AdminInvestorDetailPage.jsx');
const dialog = source('components/admin/AdminMonitoringDetailDialogs.jsx');
const utility = source('utils/adminApplicationExplorer.js');

const helperCode = utility.slice(utility.indexOf('/** Display the token symbol')).replaceAll('export const ', 'const ');
const helpers = vm.runInNewContext(`${helperCode}\n({getApplicationTokenLabel,getApplicationTokenContractUrl});`, {
  text: (value) => String(value ?? '').trim(),
  adminTokenAddressExplorerUrl: (address, base) => /^0x[\da-fA-F]{40}$/.test(String(address ?? '')) && /^https?:\/\//.test(base) ? `${base}/address/${address}` : '',
});

test('both investor token columns reuse the existing details modal without route changes', () => {
  assert.match(detail, /import \{ AdminApplicationHistoryDialog, AdminTokenDetailsDialog \}/);
  assert.match(detail, /column\.key === 'token'.*?openTokenDetails\(row\)/s);
  assert.match(detail, /tokenDisplayName\(row\)/);
  assert.match(detail, /<AdminTokenDetailsDialog[\s\S]*?tokenUid=\{selectedTokenUid\}/);
  assert.match(detail, /onClose=\{\(\) => setSelectedTokenUid\(null\)\}/);
  assert.match(detail, /tab === 'applications' \? applicationColumns : tab === 'investedTokens' \? investedTokenColumns : chainColumns/);
});

test('application timeline uses one heading and abbreviated, dark explorer links', () => {
  assert.match(dialog, /title=\{activeDocument \? 'Secure document preview' : 'Application timeline'\}/);
  assert.doesNotMatch(dialog, /<p className="m-0 text-xs font-semibold uppercase tracking-wide text-blue-700">Application timeline<\/p>/);
  assert.match(dialog, /title=\{chunk\}>\{shorten\(chunk\)\}/);
  assert.match(dialog, /text-slate-900 transition-colors hover:text-blue-700/);
  assert.match(dialog, /getAdminApplicationTransactionUrl\(chunk, explorerBase\)/);
  assert.match(dialog, /target="_blank" rel="noopener noreferrer"/);
  assert.match(dialog, /getApplicationTokenContractUrl\(history, application, resolvedToken, explorerBase\)/);
  assert.match(dialog, /enabled: Boolean\(interestUid && tokenUid && !knownAddress\)/);
});

test('token label adds symbol without duplication and prioritizes the correct application data', () => {
  assert.equal(helpers.getApplicationTokenLabel({tokenName:'Lareina Stein'}, {tokenSymbol:'DOLOREAQ'}), 'Lareina Stein (DOLOREAQ)');
  assert.equal(helpers.getApplicationTokenLabel({tokenName:'ALPHA',tokenSymbol:'alpha'}, {}), 'ALPHA');
  assert.equal(helpers.getApplicationTokenLabel({}, {}, {}), 'Investment application');
  assert.equal(helpers.getApplicationTokenLabel({}, {}, {tokenName:'Second Token',tokenSymbol:'SECOND'}), 'Second Token (SECOND)');
});

test('token contract explorer address is based on the application or resolved token, not the active wallet', () => {
  const addr = `0x${'a'.repeat(40)}`;
  assert.equal(helpers.getApplicationTokenContractUrl({}, {tokenAddress: addr}, {}, 'https://explorer.testnet.chain.robinhood.com'), `https://explorer.testnet.chain.robinhood.com/address/${addr}`);
  assert.equal(helpers.getApplicationTokenContractUrl({}, {}, {tokenAddress:addr}, 'https://example.test'), `https://example.test/address/${addr}`);
  assert.equal(helpers.getApplicationTokenContractUrl({}, {tokenAddress:'bad'}, {}, 'https://example.test'), '');
});
