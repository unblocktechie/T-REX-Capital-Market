import test from 'node:test';
import assert from 'node:assert/strict';
import { getLogsInRange, scanRecentPriceLogs, isLogRangeLimit } from '../src/services/price-history/publicPriceEventScan.js';

test('only range-limit errors are eligible for adaptive splitting', () => {
  assert.equal(isLogRangeLimit(new Error('requested block range is too wide')), true);
  assert.equal(isLogRangeLimit(new Error('RPC endpoint unavailable')), false);
});

test('RPC event ranges split automatically when provider rejects large ranges', async () => {
  const seen = [];
  const events = await getLogsInRange({
    fromBlock: 0n, toBlock: 127n,
    fetchRange: async (from, to) => {
      seen.push([from, to]);
      if (to - from >= 64n) throw new Error('block range exceeds node limit');
      return [{ from, to }];
    },
  });
  assert.equal(events.length, 2);
  assert.deepEqual(seen, [[0n, 127n], [0n, 63n], [64n, 127n]]);
});

test('successful windows survive later transient provider failures', async () => {
  let calls = 0;
  const result = await scanRecentPriceLogs({
    head: 600n, blocksPerWindow: 100n, windows: 4,
    fetchRange: async () => {
      calls++;
      if (calls === 2) throw new Error('RPC unavailable');
      return [{ transactionHash: '0xabc' }];
    },
  });
  assert.equal(result.partial, true);
  assert.equal(result.logs.length, 1);
});

test('first provider failure is reported rather than masked as an empty history', async () => {
  await assert.rejects(() => scanRecentPriceLogs({
    head: 200n, fetchRange: async () => { throw new Error('RPC unavailable'); },
  }), /RPC unavailable/);
});

test('cancelled requests stop instead of returning incomplete history', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => scanRecentPriceLogs({
    head: 200n, signal: controller.signal,
    fetchRange: async () => [],
  }), { name: 'AbortError' });
});
