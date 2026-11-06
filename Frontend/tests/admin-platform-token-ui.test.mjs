import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatAdminTokenPrice, adminTokenAddressExplorerUrl } from '../src/utils/adminTokenDisplay.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const parts = read('src/components/admin/AdminMonitoringParts.jsx');
const override = read('src/utils/chainExplorerOverrides.js');
const address = '0xE60241C5100000000000000000000000001c1F2F';

test('platform token prices show adaptive decimal precision without floating point error', () => {
  assert.equal(formatAdminTokenPrice('1.000000000000000000'), '1.00');
  assert.equal(formatAdminTokenPrice('25.999999999999999999'), '26.00');
  assert.equal(formatAdminTokenPrice('0.004999999999999'), '0.005');
  assert.equal(formatAdminTokenPrice('0.005000000000001'), '0.005');
  assert.equal(formatAdminTokenPrice('12.345'), '12.35');
  assert.equal(formatAdminTokenPrice('12.344'), '12.34');
  assert.equal(formatAdminTokenPrice('9007199254740993.1999'), '9,007,199,254,740,993.20');
  assert.equal(formatAdminTokenPrice(null), '—');
  assert.equal(formatAdminTokenPrice(''), '—');
  assert.equal(formatAdminTokenPrice('not a price'), '—');
});

test('explorer address URL uses the configured network and rejects unsafe inputs', () => {
  assert.equal(adminTokenAddressExplorerUrl(address, 'https://example.org/'), `https://example.org/address/${address}`);
  assert.equal(adminTokenAddressExplorerUrl(address, 'https://example.org/explorer/'), `https://example.org/explorer/address/${address}`);
  assert.equal(adminTokenAddressExplorerUrl('0xabc', 'https://example.org'), '');
  assert.equal(adminTokenAddressExplorerUrl(address, 'javascript:alert(1)'), '');
  assert.equal(adminTokenAddressExplorerUrl(address, ''), '');
  assert.equal(adminTokenAddressExplorerUrl(address, 'https://user:pass@example.org'), '');
});

test('platform tokens hide optional UID filters without changing global search or other admin lists', () => {
  assert.doesNotMatch(page, /placeholder="Organization UID \(optional\)"/);
  assert.doesNotMatch(page, /placeholder="Token UID \(optional\)"/);
  assert.match(page, /<ListTools search=\{search\}/);
  assert.doesNotMatch(page, /investor-side document tasks are not included/);
  assert.match(page, /adminMonitoringApi\.listTokens\(params\)/);
  assert.match(parts, /Filter by network/);
});

test('token name, ticker and address use the token network explorer when available', () => {
  assert.match(page, /chains\.find\(\(chain\) => token\.chainUid && chain\.chainUid === token\.chainUid\)/);
  assert.match(page, /resolveChainExplorerUrl\(chainId, matchingChain\?\.explorerUrl/);
  assert.match(page, /adminTokenAddressExplorerUrl\(/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /cursor-pointer/);
  assert.match(page, /hover:text-blue-700/);
  assert.match(page, /if \(!link\) return/);
  assert.match(override, /46630: 'https:\/\/explorer\.testnet\.chain\.robinhood\.com'/);
});

test('prices have precise accessible tooltips and statuses are capitalized without changing stored state', () => {
  assert.match(page, /<PriceValue value=\{value\} label=\{label\}/);
  assert.match(page, /text\.charAt\(0\)\.toUpperCase\(\) \+ text\.slice\(1\)/);
  assert.match(page, /<StateChip value=\{r\.status\} label=/);
});
