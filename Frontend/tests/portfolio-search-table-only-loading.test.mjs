import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('typing preserves the search input and visible holdings instead of swapping in skeletons', async () => {
  const source = await read('../src/pages/investor-portal/PortfolioPage.jsx');
  assert.match(source, /const \[tableLoading, setTableLoading\] = useState\(false\)/);
  assert.match(source, /const debouncedSearch = useDebounce\(search, 350\)/);
  assert.match(source, /setPage\(1\);\s*setSearch\(value.slice\(0, 100\)\)/);
  assert.match(source, /if \(search !== debouncedSearch\) return undefined;/);
  const toolbar = source.indexOf('<Card className="investor-portfolio-toolbar">');
  const results = source.indexOf('<div className="investor-portfolio-results" aria-busy={tableLoading || search !== debouncedSearch}>');
  const list = source.indexOf('<Card className="investor-portfolio-list">', results);
  assert.ok(toolbar > 0 && results > toolbar && list > results);
  assert.ok(source.indexOf('aria-label="Search portfolio"', toolbar) < results);
  assert.doesNotMatch(source.slice(results), /\{tableLoading \? \(\s*<PortfolioLoading/);
  assert.match(source, /tableLoading \|\| search !== debouncedSearch \? 'Updating holdings…'/);
});

test('portfolio summary stays based on unfiltered data while the table searches', async () => {
  const source = await read('../src/pages/investor-portal/PortfolioPage.jsx');
  assert.match(source, /if \(!debouncedSearch && page === 1\)\s*\{\s*setOverviewData/);
  assert.match(source, /overviewData\.items\.forEach/);
  assert.match(source, /overviewData\.walletBalances\[portfolioAssetKey\(token\)\]/);
  assert.match(source, /overviewData\.platformPrices\[portfolioAssetKey\(token\)\]/);
  assert.match(source, /overviewData\.meta\.total/);
  assert.match(source, /\{!loading && overviewData\.items\.length \? \(/);
});

test('cached live values survive searches while refresh still fetches current values', async () => {
  const source = await read('../src/pages/investor-portal/PortfolioPage.jsx');
  assert.match(source, /readPortfolioLiveCache\(liveBalanceCacheRef\.current, assetKey, balanceIdentity\)/);
  assert.match(source, /readPortfolioLiveCache\(livePriceCacheRef\.current, assetKey, priceIdentity\)/);
  assert.match(source, /balanceStates\[assetKey\] = balanceCached\?\.state \|\| walletBalanceState\('loading'\)/);
  assert.match(source, /priceStates\[assetKey\] = priceCached\?\.state \|\|/);
  assert.match(source, /forceLiveRefreshRef\.current = true/);
  assert.match(source, /getOrStartPortfolioLiveRead/);
  assert.match(source, /getInvestorPurchaseTokenBalance/);
  assert.match(source, /getPlatformTokenPrice/);
});

test('stale search responses, error display, and investment actions remain safe', async () => {
  const source = await read('../src/pages/investor-portal/PortfolioPage.jsx');
  assert.match(source, /requestId === latestPortfolioRequestRef\.current/);
  assert.match(source, /if \(!isCurrentRequest\(\)\) return/);
  assert.match(source, /if \(!hasLoadedPortfolioRef\.current\) setItems\(\[\]\)/);
  assert.match(source, /Unable to update portfolio results/);
  assert.match(source, /aria-busy=\{tableLoading \|\| search !== debouncedSearch\}/);
  assert.match(source, /<InvestorHistoryPagination/);
  assert.match(source, /onClick=\{\(\) => openManagement\(token\.tokenUid\)\}/);
  assert.match(source, /onClick=\{\(\) => navigate\(ROUTES\.marketplaceToken\(token\.tokenUid\)\)\}/);
});

test('results layout remains flexible without preview artifacts', async () => {
  const css = await read('../src/assets/styles/investor.css');
  assert.match(css, /\.investor-portfolio-results\s*\{\s*min-width:\s*0;/);
});
