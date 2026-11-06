import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dialogs = read('src/components/admin/AdminMonitoringDetailDialogs.jsx');
const tokenDialog = dialogs.slice(dialogs.indexOf('export function AdminTokenDetailsDialog'), dialogs.indexOf('const sortEvents'));
const details = dialogs.slice(dialogs.indexOf('function TokenOverview'), dialogs.indexOf('function TokenInvestorsPagination'));
const paging = dialogs.slice(dialogs.indexOf('function TokenInvestorsPagination'), dialogs.indexOf('export function AdminTokenDetailsDialog'));
const list = read('src/pages/admin/AdminMonitoringListsPage.jsx');

test('holder balance and status appear alongside historical investor fields, without the summary cards', () => {
  for (const heading of ['Investor', 'Wallet', 'Accreditation', 'Current Balance', 'Holding Status']) assert.match(tokenDialog, heading === 'Wallet' ? /<th[^>]*>Wallet</ : new RegExp(`modalSortHeading\\('${heading.replace('Current Balance', 'Current balance').replace('Holding Status', 'Holding status')}'`));
  assert.match(tokenDialog, /HolderBalance investor=\{investor\} token=\{token\}/);
  assert.match(tokenDialog, /HolderStatus investor=\{investor\}/);
  assert.match(tokenDialog, /MarketplaceDropdown value=\{holderStatus\}/);
  assert.doesNotMatch(tokenDialog, /<HolderSummary/);
  assert.match(tokenDialog, /AdminAddressPill value=\{investor.walletAddress\}/);
  assert.match(tokenDialog, /capitalizeStatusOption\(investor\.accreditationType\)/);
});
test('investor search and scoped request retain responsive progress feedback and 5-row pagination', () => {
  assert.match(tokenDialog, /adminMonitoringApi\.getTokenDetails\(tokenUid, \{ page, limit: INVESTOR_LIMIT, search: debouncedSearch, holderStatus \}\)/);
  assert.match(tokenDialog, /placeholderData: \(previousData, previousQuery\) => previousQuery\?\.queryKey\?\.\[2\] === tokenUid/);
  assert.match(tokenDialog, /aria-busy=\{query\.isFetching\}/);
  assert.match(tokenDialog, /setSearch\(event\.target\.value\); setPage\(1\)/);
  assert.match(tokenDialog, /<TokenInvestorsPagination pagination=\{pagination\}/);
  assert.match(dialogs, /const INVESTOR_LIMIT = 5;/);
  assert.match(paging, /Math\.min\(3, count\)/);
});
test('asset overview keeps prices and own-chain explorer without marked payment icon', () => {
  for (const heading of ['Initial price', 'Current price', 'Deployed on']) assert.match(details, new RegExp(heading));
  assert.match(details, /<span className="font-semibold text-slate-600">Token<\/span>/);
  assert.match(details, /<CompactAddress value={token.tokenAddress} label="Token address"/);
  assert.match(dialogs, /adminTokenAddressExplorerUrl\(token\.tokenAddress/);
  assert.match(dialogs, /resolveChainExplorerUrl\(chainId,/);
  assert.match(list, /chains=\{chainsQuery\.data \|\| \[\]\}/);
  assert.match(tokenDialog, /<TokenOverview token={token} chains={chains}/);
  assert.doesNotMatch(dialogs, /<TokenIcon/);
});
