import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTFOLIO_LIVE_CACHE_TTL_MS,
  portfolioBalanceIdentity,
  portfolioPriceIdentity,
  readPortfolioLiveCache,
  storePortfolioLiveCache,
  getOrStartPortfolioLiveRead,
} from '../src/utils/portfolioLiveCache.js';

test('same asset and wallet reuse their recently fetched financial values', () => {
  const cache = new Map();
  const token = { chainId: 4666, tokenAddress: '0xAABB', decimals: 6 };
  const identity = portfolioBalanceIdentity(token, '0xAccount');
  const state = { status: 'ready', balance: '0.5' };
  storePortfolioLiveCache(cache, 'asset-1', identity, state, 100);
  assert.deepEqual(readPortfolioLiveCache(cache, 'asset-1', identity, 200), { state, fresh: true });
  assert.equal(readPortfolioLiveCache(cache, 'asset-1', identity, PORTFOLIO_LIVE_CACHE_TTL_MS + 200).fresh, false);
});

test('changed wallets and chains never reuse another balance or price', () => {
  const token = { chainId: 1, tokenAddress: '0xAABB', decimals: 18 };
  const cache = new Map();
  const identity = portfolioBalanceIdentity(token, '0xUserA');
  storePortfolioLiveCache(cache, 'asset', identity, { status: 'ready', balance: '1' });
  assert.equal(readPortfolioLiveCache(cache, 'asset', portfolioBalanceIdentity(token, '0xUserB')), null);
  assert.notEqual(portfolioPriceIdentity(token, '0xUSDG'), portfolioPriceIdentity({ ...token, chainId: 2 }, '0xUSDG'));
  assert.notEqual(portfolioPriceIdentity(token, '0xUSDG'), portfolioPriceIdentity(token, '0xOtherToken'));
});

test('simultaneous searches share slow pending RPC reads instead of repeating them', async () => {
  const pending = new Map();
  let calls = 0;
  let complete;
  const task = () => new Promise((resolve) => { complete = resolve; });
  const first = getOrStartPortfolioLiveRead(pending, 'asset', 'wallet|chain', () => { calls += 1; return task(); });
  const second = getOrStartPortfolioLiveRead(pending, 'asset', 'wallet|chain', () => { calls += 1; return task(); });
  await Promise.resolve();
  assert.equal(first, second);
  assert.equal(calls, 1);
  complete('250');
  assert.deepEqual(await Promise.all([first, second]), ['250', '250']);
  assert.equal(pending.size, 0);
  assert.equal(await getOrStartPortfolioLiveRead(pending, 'asset', 'wallet|chain', () => '251'), '251');
});
