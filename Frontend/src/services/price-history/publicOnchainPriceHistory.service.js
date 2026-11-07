import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem';
import controllerAbi from '@/abi/TREXPlatformController.json';
import { web3Config } from '@/config/web3';
import { scanRecentPriceLogs } from './publicPriceEventScan';

const tokenPriceEvent = controllerAbi.find((item) => item.type === 'event' && item.name === 'TokenPriceUpdated');
const priceDecimalsFn = controllerAbi.find((item) => item.type === 'function' && item.name === 'PRICE_DECIMALS');
const MAX_WINDOWS = 10;
const BLOCKS_PER_WINDOW = 1_800n;
const FINALITY_BUFFER = 12n;
const MAX_RESULTS = 20;

// Public on-chain events are not the issuer-only database audit; do not call that API here.
export async function fetchRecentPublicPriceEvents({ chainId, tokenAddress, signal }) {
  const record = web3Config.getChainRecordById(chainId);
  if (!record?.publicRpcUrl || !isAddress(tokenAddress) || !isAddress(record.platformControllerAddress)) {
    throw new Error('Public on-chain price history is not configured for this asset.');
  }
  if (!tokenPriceEvent) throw new Error('The platform contract does not expose price events.');
  const client = createPublicClient({
    chain: web3Config.getChainById(chainId),
    transport: http(record.publicRpcUrl, { timeout: 15_000, retryCount: 1 }),
  });
  const head = await client.getBlockNumber();
  const confirmedHead = head > FINALITY_BUFFER ? head - FINALITY_BUFFER : 0n;
  const { logs, partial } = await scanRecentPriceLogs({
    head: confirmedHead,
    signal,
    windows: MAX_WINDOWS,
    blocksPerWindow: BLOCKS_PER_WINDOW,
    maxResults: MAX_RESULTS,
    fetchRange: (fromBlock, toBlock) => client.getLogs({
      address: record.platformControllerAddress,
      event: tokenPriceEvent,
      args: { token: getAddress(tokenAddress) },
      fromBlock,
      toBlock,
    }),
  });
  // Check precision only when there are events; a failed contract read cannot erase event history.
  // A read failure for a secondary contract getter must not hide transaction events.
  // Do not guess precision or display misleading financial amounts if it cannot be verified.
  let decimalPlaces = null;
  if (logs.length > 0 && priceDecimalsFn) {
    try {
      const value = Number(await client.readContract({ address: record.platformControllerAddress, abi: [priceDecimalsFn], functionName: 'PRICE_DECIMALS' }));
      if (Number.isSafeInteger(value) && value >= 0 && value <= 36) decimalPlaces = value;
    } catch {
      // The events and their transaction hashes may still be accessible.
    }
  }

  const latest = logs
    .sort((a, b) => Number(b.blockNumber - a.blockNumber) || Number(b.logIndex - a.logIndex))
    .slice(0, MAX_RESULTS);
  const blockTimes = new Map();
  const uniqueBlocks = [...new Set(latest.map((entry) => String(entry.blockNumber)))];
  // Avoid a burst of parallel eth_getBlockByNumber requests that can throttle public RPCs.
  for (let index = 0; index < uniqueBlocks.length; index += 2) {
    await Promise.all(uniqueBlocks.slice(index, index + 2).map(async (block) => {
      if (signal?.aborted) return;
      try {
        const metadata = await client.getBlock({ blockNumber: BigInt(block) });
        blockTimes.set(block, new Date(Number(metadata.timestamp) * 1000).toISOString());
      } catch {
        // Preserve available price event/transaction details if timestamps are unavailable.
      }
    }));
  }
  if (signal?.aborted) {
    const error = new Error('Price history request was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
  return {
    items: latest.map((entry) => ({
      uid: `${entry.transactionHash}-${entry.logIndex}`,
      createdAt: blockTimes.get(String(entry.blockNumber)) || null,
      oldPriceFormatted: decimalPlaces == null || entry.args?.oldPrice == null ? null : formatUnits(entry.args.oldPrice, decimalPlaces),
      newPriceFormatted: decimalPlaces == null || entry.args?.newPrice == null ? null : formatUnits(entry.args.newPrice, decimalPlaces),
      transactionHash: entry.transactionHash,
      chainId: record.chainId,
    })),
    partial,
    pricePrecisionAvailable: decimalPlaces != null,
  };
}
