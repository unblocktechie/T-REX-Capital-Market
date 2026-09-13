import { AppKit, isRetryableError } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { web3Config } from '@/config/web3';

const clean = (value) => String(value ?? '').trim();

export const getUsdcBridgeRoute = (routeId) => {
  const route = web3Config.usdcBridge?.routes?.[routeId];
  if (!route?.source?.appKitChain || !route?.destination?.appKitChain) {
    throw new Error('This USDC bridge direction is not configured.');
  }
  return route;
};

const bridgeParams = ({ adapter, amount, route }) => ({
  from: {
    adapter,
    chain: route.source.appKitChain,
  },
  to: {
    adapter,
    chain: route.destination.appKitChain,
  },
  amount: clean(amount),
  token: web3Config.usdcBridge.token || 'USDC',
  config: {
    transferSpeed: web3Config.usdcBridge.transferSpeed,
    ...(web3Config.usdcBridge.maxFee ? { maxFee: web3Config.usdcBridge.maxFee } : {}),
    // Keep the Privy confirmations explicit. This works for either EVM source
    // direction and avoids relying on EIP-5792 batching support.
    batchTransactions: false,
  },
});

export const createUsdcBridgeSession = async ({ provider, amount, routeId }) => {
  if (!provider?.request) throw new Error('Your Privy secure account provider is unavailable.');
  if (!clean(amount)) throw new Error('Enter a USDC amount to bridge.');

  const route = getUsdcBridgeRoute(routeId);
  const adapter = await createViemAdapterFromProvider({ provider });
  const kit = new AppKit();
  const params = bridgeParams({ adapter, amount, route });
  const estimate = await kit.estimateBridge(params);

  return {
    adapter,
    kit,
    params,
    estimate,
    route,
    routeId,
  };
};

const failedBridgeStep = (result) =>
  (Array.isArray(result?.steps) ? result.steps : []).find((step) => step?.error);

export const executeUsdcBridgeSession = async ({ session, onEvent }) => {
  if (!session?.kit || !session?.adapter || !session?.params) {
    throw new Error('Bridge review expired. Review the bridge again before confirming.');
  }

  const handler = (payload) => onEvent?.(payload);
  session.kit.on('*', handler);

  try {
    let result = await session.kit.bridge(session.params);
    const failedStep = failedBridgeStep(result);

    // Resume the SDK's returned CCTP operation only when App Kit explicitly
    // marks it as retryable. Never submit a second, unrelated bridge transfer.
    if (
      result?.state === 'error'
      && failedStep?.error
      && typeof isRetryableError === 'function'
      && isRetryableError(failedStep.error)
    ) {
      result = await session.kit.retryBridge(result, {
        from: session.adapter,
        to: session.adapter,
      });
    }

    return result;
  } finally {
    session.kit.off('*', handler);
  }
};

export const normalizeBridgeStepName = (payload) => clean(
  payload?.method
  || payload?.values?.name
  || payload?.name
  || payload?.action,
).replace(/^bridge\./i, '').toLowerCase();

export const bridgeExplorerUrl = (stepOrPayload) => clean(
  stepOrPayload?.explorerUrl
  || stepOrPayload?.values?.explorerUrl
  || stepOrPayload?.values?.data?.explorerUrl
  || stepOrPayload?.data?.explorerUrl,
);
