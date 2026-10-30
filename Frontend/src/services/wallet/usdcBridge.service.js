import { BridgeKit } from '@circle-fin/bridge-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { estimateWalletNativeGasBudget, readWalletNativeBalance, readWalletTokenBalance, resolveNativeRpcDecimals } from './walletAssets.service';
import { bridgeStepState, bridgeTransactionHash, isBridgeStepEventComplete, isBridgeStepEventFailed, isUsdcBridgeResultComplete, normalizeBridgeStepName } from './usdcBridgeLifecycle';

export { bridgeStepState, bridgeTransactionHash, isBridgeStepEventComplete, isBridgeStepEventFailed, isUsdcBridgeResultComplete, normalizeBridgeStepName } from './usdcBridgeLifecycle';

const clean = (value) => String(value ?? '').trim();
const GAS_BUFFER_BPS = 12_500n;
const BPS_DENOMINATOR = 10_000n;
const FALLBACK_GAS_UNITS = 500_000;
const positiveDecimal = (value) => /^\d+(?:\.\d+)?$/.test(clean(value)) && /[1-9]/.test(clean(value));
const normalizeKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const withGasBuffer = (raw) => (raw * GAS_BUFFER_BPS + (BPS_DENOMINATOR - 1n)) / BPS_DENOMINATOR;
const displayAmount = (value, digits = 8) => {
  const [whole = '0', fraction = ''] = clean(value).split('.');
  const clipped = fraction.slice(0, digits).replace(/0+$/, '');
  return `${whole || '0'}${clipped ? `.${clipped}` : ''}`;
};

const friendlyNetworkName = (side) => {
  const name = clean(side?.networkName);
  return /^arc$/i.test(name) ? 'Arc' : (name || 'this network');
};

const networkFeeTokenLabel = (side) => {
  const symbol = clean(side?.nativeSymbol);
  if (symbol.toUpperCase() === 'USDC') return 'USDC';
  const nativeName = clean(side?.nativeName).replace(/\bEther\b/gi, 'ETH');
  if (nativeName) return nativeName;
  if (symbol.toUpperCase() === 'ETH') {
    const networkName = friendlyNetworkName(side);
    if (/arbitrum/i.test(networkName)) return 'Arbitrum ETH';
    if (/sepolia/i.test(networkName)) return 'Sepolia ETH';
  }
  return symbol || 'the network fee token';
};

const networkFeeRequirementMessage = (side, transactionSide) =>
  `You need ${networkFeeTokenLabel(side)} on ${friendlyNetworkName(side)} in your wallet to complete the ${transactionSide} transaction.`;

export const CIRCLE_BRIDGE_CHAIN_BY_ID = Object.freeze({
  // Mainnet
  1: 'Ethereum',
  42161: 'Arbitrum',
  5042: 'Arc',

  // Testnet
  11155111: 'Ethereum_Sepolia',
  421614: 'Arbitrum_Sepolia',
  5042002: 'Arc_Testnet',
});

export const getCircleBridgeChain = (chainId) => CIRCLE_BRIDGE_CHAIN_BY_ID[Number(chainId)] || '';

const sideFromConfig = (config) => {
  if (!config?.chainId) return null;
  const appKitChain = getCircleBridgeChain(config.chainId);
  if (!appKitChain) return null;
  const nativeSymbol = clean(config.nativeCurrencySymbol || config.nativeCurrency?.symbol);
  const nativeDecimals = resolveNativeRpcDecimals({ chainId: config.chainId, symbol: nativeSymbol, configuredDecimals: config.nativeCurrencyDecimals ?? config.nativeCurrency?.decimals });
  const usdcIsNative = nativeSymbol.toUpperCase() === 'USDC';
  const usdc = (config.paymentTokens || []).find((item) => item?.active !== false && clean(item.symbol).toUpperCase() === 'USDC');
  if (!usdcIsNative && !usdc?.contractAddress) return null;
  return {
    chainId: Number(config.chainId),
    chainUid: clean(config.chainUid),
    appKitChain,
    networkName: clean(config.chainName || config.networkName) || appKitChain.replaceAll('_', ' '),
    chainImageUrl: clean(config.imageUrl),
    nativeSymbol: nativeSymbol || 'ETH',
    nativeName: clean(config.nativeCurrencyName || config.nativeCurrency?.name),
    nativeDecimals: Number.isInteger(nativeDecimals) ? nativeDecimals : 18,
    nativeImageUrl: clean(config.nativeCurrencyImageUrl) || clean(config.imageUrl),
    usdcIsNative,
    usdcAddress: usdcIsNative ? '' : usdc.contractAddress,
    usdcDecimals: Number.isInteger(Number(usdc?.decimals)) ? Number(usdc.decimals) : 6,
    usdcImageUrl: clean(usdc?.imageUrl) || (usdcIsNative ? clean(config.imageUrl) : ''),
    isTestnet: Boolean(config.isTestnet),
  };
};

export const buildUsdcBridgeRoutes = (chainConfigs = []) => {
  const sides = chainConfigs.map(sideFromConfig).filter(Boolean);
  return sides.flatMap((source) => sides
    .filter((destination) => destination.chainId !== source.chainId && destination.isTestnet === source.isTestnet)
    .map((destination) => ({
      id: `${source.chainId}-${destination.chainId}`,
      label: `Bridge to ${destination.networkName}`,
      source,
      destination,
    })));
};

export const getUsdcBridgeConfigurationIssue = (routes = []) => {
  if (!Array.isArray(routes) || !routes.length) return 'USDC bridge routes are unavailable for the configured networks.';
  for (const route of routes) {
    if (!route?.source?.appKitChain || !route?.destination?.appKitChain) return 'A USDC bridge route is incomplete.';
  }
  return '';
};

export const getUsdcBridgeRoute = (routes, routeId) => {
  const route = (routes || []).find((item) => item.id === routeId);
  if (!route) throw new Error('This USDC bridge direction is not configured.');
  return route;
};

const bridgeParams = ({ adapter, amount, route }) => ({
  from: { adapter, chain: route.source.appKitChain },
  to: { adapter, chain: route.destination.appKitChain },
  amount: clean(amount),
  token: 'USDC',
  config: { transferSpeed: 'FAST' },
});

const feeAmount = (fee) => clean(fee?.amount ?? fee?.fee ?? fee?.value ?? fee?.fees?.fee ?? fee?.fees?.amount ?? fee?.fees?.value);
const feeToken = (fee) => clean(fee?.token || fee?.symbol || fee?.currency || fee?.fees?.token || fee?.fees?.symbol);
const feeChainCandidates = (fee) => [fee?.chain, fee?.chainName, fee?.network, fee?.networkName, fee?.chainId, fee?.networkId, fee?.blockchain].map(normalizeKey).filter(Boolean);
const routeSideCandidates = (side) => [side?.appKitChain, side?.networkName, side?.chainId].map(normalizeKey).filter(Boolean);
const feeMatchesSide = (fee, side, sideName) => {
  const feeCandidates = feeChainCandidates(fee);
  if (feeCandidates.some((candidate) => routeSideCandidates(side).includes(candidate))) return true;
  if (!feeCandidates.length) {
    const operation = normalizeKey(fee?.step || fee?.method || fee?.action || fee?.name || fee?.label || fee?.type);
    if (sideName === 'source' && /(approve|approval|burn|deposit)/.test(operation)) return true;
    if (sideName === 'destination' && /(mint|receive|destination)/.test(operation)) return true;
  }
  return false;
};
const estimateGasFeeRecords = (estimate) => {
  if (Array.isArray(estimate?.gasFees) && estimate.gasFees.length) return estimate.gasFees;
  if (estimate?.gasFees && typeof estimate.gasFees === 'object') return Object.values(estimate.gasFees).filter(Boolean);
  return (Array.isArray(estimate?.fees) ? estimate.fees : []).filter((fee) => /gas/i.test(clean(fee?.type || fee?.name || fee?.label)));
};
const circleGasRequirementForSide = ({ estimate, route, sideName, decimals }) => {
  const records = estimateGasFeeRecords(estimate);
  let matches = records.filter((fee) => feeMatchesSide(fee, route?.[sideName], sideName));
  if (!matches.length && records.length === 2 && records.every((fee) => !feeChainCandidates(fee).length)) matches = [records[sideName === 'source' ? 0 : 1]];
  let estimatedRaw = 0n;
  for (const record of matches) {
    const amount = feeAmount(record);
    if (!positiveDecimal(amount)) continue;
    const token = normalizeKey(feeToken(record));
    const expected = normalizeKey(route?.[sideName]?.nativeSymbol);
    if (token && expected && token !== expected) continue;
    try { estimatedRaw += parseUnits(amount, decimals); } catch { /* fallback below */ }
  }
  if (estimatedRaw <= 0n) return null;
  const requiredRaw = withGasBuffer(estimatedRaw);
  return { estimatedRaw, requiredRaw, estimated: formatUnits(estimatedRaw, decimals), required: formatUnits(requiredRaw, decimals), method: 'circle', methodLabel: 'Circle gas estimate' };
};
const gasRequirementForSide = async ({ estimate, route, sideName, decimals }) => {
  const circle = circleGasRequirementForSide({ estimate, route, sideName, decimals });
  if (circle) return circle;
  const budget = await estimateWalletNativeGasBudget({ chainId: route[sideName].chainId, gasUnits: FALLBACK_GAS_UNITS });
  const requiredRaw = withGasBuffer(budget.estimatedRaw);
  return { estimatedRaw: budget.estimatedRaw, requiredRaw, estimated: formatUnits(budget.estimatedRaw, decimals), required: formatUnits(requiredRaw, decimals), method: 'rpc-fallback', methodLabel: 'RPC safety reserve' };
};

const readFreshBalances = async ({ walletAddress, route }) => {
  if (!isAddress(clean(walletAddress))) throw new Error('The connected wallet address is invalid.');
  const [sourceGas, destinationGas, sourceToken] = await Promise.all([
    readWalletNativeBalance({ walletAddress, chainId: route.source.chainId }),
    readWalletNativeBalance({ walletAddress, chainId: route.destination.chainId }),
    route.source.usdcIsNative ? Promise.resolve(null) : readWalletTokenBalance({ tokenAddress: route.source.usdcAddress, walletAddress, chainId: route.source.chainId, decimals: route.source.usdcDecimals || 6 }),
  ]);
  return { sourceGas, destinationGas, sourceToken: route.source.usdcIsNative ? sourceGas : sourceToken };
};

export const validateUsdcBridgePreflight = async ({ walletAddress, amount, route, estimate }) => {
  const normalizedAmount = clean(amount);
  if (!positiveDecimal(normalizedAmount)) throw new Error('Enter an amount greater than 0 USDC.');
  if (!estimate) throw new Error('A current Circle bridge estimate is required before signing.');
  const balances = await readFreshBalances({ walletAddress, route });
  const requestedRaw = parseUnits(normalizedAmount, Number(balances.sourceToken.decimals ?? 6));
  if (balances.sourceToken.rawBalance < requestedRaw) throw new Error(`Insufficient USDC on ${route.source.networkName}. You have ${displayAmount(balances.sourceToken.formatted, 6)} USDC.`);
  const [sourceGasReq, destinationGasReq] = await Promise.all([
    gasRequirementForSide({ estimate, route, sideName: 'source', decimals: balances.sourceGas.decimals }),
    gasRequirementForSide({ estimate, route, sideName: 'destination', decimals: balances.destinationGas.decimals }),
  ]);
  if (route.source.usdcIsNative) {
    const bridgeNativeRaw = parseUnits(normalizedAmount, balances.sourceGas.decimals);
    if (balances.sourceGas.rawBalance < bridgeNativeRaw + sourceGasReq.requiredRaw) throw new Error(`Keep enough ${networkFeeTokenLabel(route.source)} on ${friendlyNetworkName(route.source)} in your wallet for both the bridge amount and the network fee.`);
  } else if (balances.sourceGas.rawBalance < sourceGasReq.requiredRaw) {
    throw new Error(networkFeeRequirementMessage(route.source, 'source'));
  }
  if (balances.destinationGas.rawBalance < destinationGasReq.requiredRaw) throw new Error(networkFeeRequirementMessage(route.destination, 'destination'));
  return {
    ok: true,
    sourceToken: { balance: balances.sourceToken.formatted, required: normalizedAmount, symbol: 'USDC' },
    sourceGas: { balance: balances.sourceGas.formatted, required: sourceGasReq.required, symbol: route.source.nativeSymbol, methodLabel: sourceGasReq.methodLabel },
    destinationGas: { balance: balances.destinationGas.formatted, required: destinationGasReq.required, symbol: route.destination.nativeSymbol, methodLabel: destinationGasReq.methodLabel },
  };
};

const normalizeSdkError = (error, route) => {
  const message = clean(error?.shortMessage || error?.message || error);
  if (/invalid chain|not supported for bridging/i.test(message)) return new Error(`Circle bridge support for ${route.source.networkName} → ${route.destination.networkName} is unavailable in this build.`);
  return error instanceof Error ? error : new Error(message || 'Unable to prepare this USDC bridge.');
};

export const createUsdcBridgeSession = async ({ provider, walletAddress, amount, route }) => {
  if (!provider?.request) throw new Error('The connected wallet provider is unavailable.');
  if (!isAddress(clean(walletAddress))) throw new Error('The connected wallet address is unavailable.');
  const adapter = await createViemAdapterFromProvider({ provider });
  const kit = new BridgeKit();
  const params = bridgeParams({ adapter, amount, route });
  try {
    const estimate = await kit.estimate(params);
    const preflight = await validateUsdcBridgePreflight({ walletAddress, amount, route, estimate });
    return { adapter, kit, params, estimate, preflight, route, walletAddress, amount: clean(amount) };
  } catch (error) { throw normalizeSdkError(error, route); }
};

export const revalidateUsdcBridgeSession = async (session) => {
  if (!session?.kit || !session?.params || !session?.route) throw new Error('Bridge review expired. Review the bridge again before confirming.');
  try {
    const estimate = await session.kit.estimate(session.params);
    const preflight = await validateUsdcBridgePreflight({ walletAddress: session.walletAddress, amount: session.amount, route: session.route, estimate });
    return { ...session, estimate, preflight };
  } catch (error) { throw normalizeSdkError(error, session.route); }
};

const failedBridgeStep = (result) => (Array.isArray(result?.steps) ? result.steps : []).find((step) => step?.error);
const FINAL_MINT_EVENT_TIMEOUT_MS = 10 * 60_000;

const mergeObservedBridgeEvents = (result, observedEvents) => {
  if (!result || !observedEvents?.size) return result;
  const steps = Array.isArray(result.steps) ? [...result.steps] : [];
  observedEvents.forEach((payload, name) => {
    const index = steps.findIndex((step) => normalizeBridgeStepName(step) === name);
    const existing = index >= 0 ? steps[index] : { name };
    const txHash = bridgeTransactionHash(payload);
    const state = isBridgeStepEventFailed(payload)
      ? 'error'
      : isBridgeStepEventComplete(payload)
        ? 'success'
        : bridgeStepState(payload) || existing.state;
    const next = {
      ...existing,
      ...(state ? { state } : {}),
      ...(txHash ? { txHash } : {}),
      ...(payload?.explorerUrl || payload?.values?.explorerUrl || payload?.data?.explorerUrl
        ? { explorerUrl: clean(payload?.explorerUrl || payload?.values?.explorerUrl || payload?.data?.explorerUrl) }
        : {}),
      ...(payload?.error || payload?.values?.error || payload?.data?.error
        ? { error: payload?.error || payload?.values?.error || payload?.data?.error }
        : {}),
    };
    if (index >= 0) steps[index] = next;
    else steps.push(next);
  });
  return { ...result, steps };
};

export const executeUsdcBridgeSession = async ({ session, onEvent }) => {
  if (!session?.preflight?.ok) throw new Error('Bridge validation is incomplete. Review the bridge again before confirming.');

  const observedEvents = new Map();
  let settleFinalMint;
  let finalMintSettled = false;
  const finalMintEvent = new Promise((resolve) => { settleFinalMint = resolve; });
  const settleMint = (payload) => {
    if (finalMintSettled) return;
    finalMintSettled = true;
    settleFinalMint(payload);
  };
  const handler = (payload) => {
    const name = normalizeBridgeStepName(payload);
    if (name) observedEvents.set(name, payload);
    onEvent?.(payload);
    if (name === 'mint' && (isBridgeStepEventComplete(payload) || isBridgeStepEventFailed(payload))) settleMint(payload);
  };

  session.kit.on('*', handler);
  try {
    let result = await session.kit.bridge(session.params);

    // Bridge Kit can report a successful orchestration result while an EIP-5792
    // destination wallet request is still open. Keep the event subscription and
    // UI lifecycle alive until the mint event proves that the final MetaMask
    // confirmation has actually submitted (or failed).
    result = mergeObservedBridgeEvents(result, observedEvents);
    if (result?.state === 'success' && !isUsdcBridgeResultComplete(result)) {
      let timeoutId;
      const timeout = new Promise((resolve) => {
        timeoutId = globalThis.setTimeout(() => resolve(null), FINAL_MINT_EVENT_TIMEOUT_MS);
      });
      await Promise.race([finalMintEvent, timeout]);
      globalThis.clearTimeout(timeoutId);
      result = mergeObservedBridgeEvents(result, observedEvents);
    }

    const failed = failedBridgeStep(result);
    if (result?.state === 'error' && failed?.error) {
      try {
        result = await session.kit.retry(result, { from: session.adapter, to: session.adapter });
        result = mergeObservedBridgeEvents(result, observedEvents);
      } catch {
        // Preserve the original partial result when Circle reports that this
        // failure is not actionable through BridgeKit.retry().
      }
    }
    return result;
  } finally {
    settleMint(null);
    session.kit.off('*', handler);
  }
};
export const bridgeExplorerUrl = (payload) => clean(payload?.explorerUrl || payload?.values?.explorerUrl || payload?.values?.data?.explorerUrl || payload?.data?.explorerUrl);
