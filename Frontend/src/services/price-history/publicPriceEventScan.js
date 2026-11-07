// Keep the RPC-range recovery independent of viem so provider limitations can be tested.
// Some public RPCs refuse eth_getLogs over their configured maximum block range.
const errorText = (error) => [
  error?.shortMessage,
  error?.details,
  error?.message,
  error?.cause?.shortMessage,
  error?.cause?.details,
  error?.cause?.message,
].filter(Boolean).join(' ');

export function isLogRangeLimit(error) {
  return /block\s*range|range.{0,35}(?:too (?:large|wide)|exceed|limit)|(?:limit|maximum|more than).{0,35}blocks|too many (?:results|logs)|query returned more than|response size exceeded|eth_getLogs.{0,40}limit/i.test(errorText(error));
}

const assertNotAborted = (signal) => {
  if (signal?.aborted) {
    const error = new Error('Price history request was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};

/** Split ONLY known range-limit errors; don't multiply requests when an RPC is offline. */
export async function getLogsInRange({ fetchRange, fromBlock, toBlock, signal, minimumSize = 32n }) {
  assertNotAborted(signal);
  try {
    return await fetchRange(fromBlock, toBlock);
  } catch (error) {
    const size = toBlock - fromBlock + 1n;
    if (!isLogRangeLimit(error) || size <= minimumSize || fromBlock >= toBlock) throw error;
    const midpoint = (fromBlock + toBlock) / 2n;
    // Sequential rather than parallel to avoid rate-limiting the already constrained RPC.
    const first = await getLogsInRange({ fetchRange, fromBlock, toBlock: midpoint, signal, minimumSize });
    const second = await getLogsInRange({ fetchRange, fromBlock: midpoint + 1n, toBlock, signal, minimumSize });
    return [...first, ...second];
  }
}

/** Preserve successful windows even if a later RPC request is rejected. */
export async function scanRecentPriceLogs({ fetchRange, head, signal, windows = 10, blocksPerWindow = 1800n, maxResults = 20 }) {
  const logs = [];
  let toBlock = head;
  let completedWindows = 0;
  let partial = false;
  for (let index = 0; index < windows && logs.length < maxResults; index += 1) {
    assertNotAborted(signal);
    const fromBlock = toBlock >= blocksPerWindow ? toBlock - blocksPerWindow + 1n : 0n;
    try {
      const batch = await getLogsInRange({ fetchRange, fromBlock, toBlock, signal });
      assertNotAborted(signal);
      logs.push(...batch);
      completedWindows += 1;
    } catch (error) {
      if (error.name === 'AbortError' || completedWindows === 0) throw error;
      partial = true;
      break;
    }
    if (fromBlock === 0n) break;
    toBlock = fromBlock - 1n;
  }
  return { logs, partial, completedWindows };
}
