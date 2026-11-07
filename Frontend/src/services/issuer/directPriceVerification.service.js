/**
 * Verify the saved price transaction hash without sending another wallet transaction.
 * HTTP 202 means the node/indexer has not confirmed it yet, never a price update.
 */
const RETRY_INTERVAL_MS = 5_000;
const MAX_ERROR_BACKOFF_MS = 30_000;

export const isTransientPriceVerificationError = (error) => {
  const status = Number(error?.response?.status);
  const code = String(error?.response?.data?.error?.code || error?.response?.data?.code || '').toUpperCase();
  // A mismatched RPC chain requires intervention, not repeated traffic.
  if (code.includes('CHAIN_MISMATCH')) return false;
  return !error?.response || [429, 500, 502, 503, 504].includes(status);
};

export const waitForPriceVerificationRetry = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(signal.reason || new Error('Verification cancelled.'));
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  function onAbort() {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    reject(signal?.reason || new Error('Verification cancelled.'));
  }
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function verifyDirectPriceUntilSynchronized({
  submit,
  currentTokenPrice,
  txHash,
  chainUid,
  priceUpdateUid,
  signal,
  onPending,
  onTemporaryFailure,
  sleep = waitForPriceVerificationRetry,
}) {
  if (typeof submit !== 'function') throw new Error('Price verification requester is required.');
  if (!priceUpdateUid) throw new Error('Prepared price request ID is required before verification.');
  let transientFailures = 0;

  while (!signal?.aborted) {
    try {
      const result = await submit(currentTokenPrice, txHash, chainUid, priceUpdateUid, signal);
      if (!result?.pending) return result?.token;
      transientFailures = 0;
      onPending?.(result);
      await sleep(RETRY_INTERVAL_MS, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!isTransientPriceVerificationError(error)) throw error;
      transientFailures += 1;
      const delayMs = Math.min(RETRY_INTERVAL_MS * (2 ** Math.min(transientFailures - 1, 3)), MAX_ERROR_BACKOFF_MS);
      onTemporaryFailure?.(error, delayMs);
      await sleep(delayMs, signal);
    }
  }
  throw signal?.reason || new Error('Verification cancelled.');
}
