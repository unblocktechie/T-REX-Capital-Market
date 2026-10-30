import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('tab badges reuse the sidebar issuer action counts, without treating all investors as urgent', async () => {
  const page = await read('../src/pages/issuer/IssuerInvestorManagementPage.jsx');
  const sidebar = await read('../src/layouts/components/Sidebar.jsx');
  assert.match(page, /useSidebarActionIndicators\(ROLES\.issuer\)/);
  assert.match(page, /'investment-requests': Math\.max\(0, Number\(actionCounts\?\.\[ROUTES\.investors\]\) \|\| 0\)/);
  assert.match(page, /'redemption-requests': Math\.max\(0, Number\(actionCounts\?\.\[ROUTES\.issuerRedemptions\]\) \|\| 0\)/);
  assert.doesNotMatch(page, /'investors': Math\.max/);
  assert.match(sidebar, /actionIndicators\.data\?\.\[ROUTES\.investors\]/);
  assert.match(sidebar, /actionIndicators\.data\?\.\[ROUTES\.issuerRedemptions\]/);
  assert.match(page, /tabAttentionCounts\[tab\.id\] > 0 \? \(/);
  assert.match(page, /aria-label=\{tabAttentionCounts\[tab\.id\] > 0/);
  assert.match(page, /tabAttentionCounts\[tab\.id\] > 99 \? '99\+' : tabAttentionCounts\[tab\.id\]/);
});

test('all three independent screens display no more than five records per page and paginate extra records', async () => {
  const directory = await read('../src/pages/issuer/IssuerInvestorDirectoryPage.jsx');
  const investments = await read('../src/pages/issuer/IssuerInvestorsPage.jsx');
  const redemptions = await read('../src/pages/issuer/IssuerRedemptionsPage.jsx');
  for (const page of [directory, investments, redemptions]) {
    assert.match(page, /const PAGE_SIZE = 5;/);
    assert.match(page, /<InvestorHistoryPagination/);
    assert.match(page, /totalPages > 1/);
    assert.match(page, /loadingRows=\{(?:5|PAGE_SIZE)\}/);
    assert.match(page, /const \[page, setPage\] = useState\(1\)/);
  }
  assert.match(directory, /limit: PAGE_SIZE/);
  assert.match(directory, /totalPages=\{meta\.totalPages\}/);
  assert.match(investments, /visibleRequests\.slice\(startIndex, startIndex \+ PAGE_SIZE\)/);
  assert.match(redemptions, /visibleRows\.slice\(start, start \+ PAGE_SIZE\)/);
});

test('tab switches preserve separate searches, filters, pagination and use deep-linked URLs', async () => {
  const page = await read('../src/pages/issuer/IssuerInvestorManagementPage.jsx');
  assert.match(page, /new Set\(\[activeTab\]\)/);
  assert.match(page, /visitedTabs\.has\(tab\.id\) \|\| tab\.id === activeTab/);
  assert.match(page, /hidden=\{activeTab !== tab\.id\}/);
  assert.match(page, /next\.set\('tab', id\)/);
  assert.match(page, /tabIndex=\{activeTab === tab\.id \? 0 : -1\}/);
});
