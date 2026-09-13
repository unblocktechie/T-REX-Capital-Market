import { AppKit, isRetryableError } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { web3Config } from '@/config/web3';

const clean = (value) => String(value ?? '').trim();

const bridgeParams = ({ adapter, amount }) => ({
  from: {
    adapter,
    chain: web3Config.arcBridge.source.appKitChain,
  },
  to: {
    adapter,
    chain: web3Config.arcBridge.destination.appKitChain,
  },
  amount: clean(amount),
  token: 'USDC',
  config: {
    transferSpeed: web3Config.arcBridge.transferSpeed,
    ...(web3Config.arcBridge.maxFee ? { maxFee: web3Config.arcBridge.maxFee } : {}),
    // Privy embedded wallets do not need EIP-5792 batching for this flow. Keeping
    // approve and burn sequential also makes each confirmation/status explicit.
    batchTransactions: false,
  },
});

export const createArcBridgeSession = async ({ provider, amount }) => {
  if (!provider?.request) throw new Error('Your Privy secure account provider is unavailable.');
  if (!clean(amount)) throw new Error('Enter a USDC amount to bridge.');

  const adapter = await createViemAdapterFromProvider({ provider });
  const kit = new AppKit();
  const params = bridgeParams({ adapter, amount });
  const estimate = await kit.estimateBridge(params);

  return {
    adapter,
    kit,
    params,
    estimate,
  };
};

const failedBridgeStep = (result) =>
  (Array.isArray(result?.steps) ? result.steps : []).find((step) => step?.error);

export const executeArcBridgeSession = async ({ session, onEvent }) => {
  if (!session?.kit || !session?.adapter || !session?.params) {
    throw new Error('Bridge review expired. Review the bridge again before confirming.');
  }

  const handler = (payload) => onEvent?.(payload);
  session.kit.on('*', handler);

  try {
    let result = await session.kit.bridge(session.params);
    const failedStep = failedBridgeStep(result);

    // App Kit's retryBridge resumes from its returned bridge state instead of
    // submitting a brand-new bridge. Retry once only when the SDK marks the
    // failed step as retryable, preserving CCTP idempotency.
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
