import { AppKit, isRetryableError } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { web3Config } from '@/config/web3';
import {
  estimateWalletNativeGasBudget,
  readWalletNativeBalance,
  readWalletTokenBalance,
} from '@/services/wallet/walletAssets.service';

const clean = (value) => String(value ?? '').trim();
const GAS_BUFFER_BPS = 12_500n;
const BPS_DENOMINATOR = 10_000n;

const BRIDGE_CHAINS_BY_ENVIRONMENT = Object.freeze({
  mainnet: new Set(['Ethereum', 'Arc']),
  testnet: new Set(['Ethereum_Sepolia', 'Arc_Testnet']),
});

const normalizeKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const positiveDecimal = (value) => /^\d+(?:\.\d+)?$/.test(clean(value)) && /[1-9]/.test(clean(value));

const displayAmount = (value, digits = 8) => {
  const normalized = clean(value);
  if (!normalized) return '0';
  const [whole = '0', fraction = ''] = normalized.split('.');
  const clipped = fraction.slice(0, digits).replace(/0+$/, '');
  return `${whole || '0'}${clipped ? `.${clipped}` : ''}`;
};

const withGasBuffer = (rawAmount) => (
  (rawAmount * GAS_BUFFER_BPS + (BPS_DENOMINATOR - 1n)) / BPS_DENOMINATOR
);

const feeAmount = (fee) => clean(
  fee?.amount
  ?? fee?.fee
  ?? fee?.value
  ?? fee?.fees?.fee
  ?? fee?.fees?.amount
  ?? fee?.fees?.value,
);
const feeToken = (fee) => clean(
  fee?.token
  || fee?.symbol
  || fee?.currency
  || fee?.fees?.token
  || fee?.fees?.symbol,
);

const feeChainCandidates = (fee) => [
  fee?.chain,
  fee?.chainName,
  fee?.network,
  fee?.networkName,
  fee?.chainId,
  fee?.networkId,
  fee?.blockchain,
].map(normalizeKey).filter(Boolean);

const routeSideCandidates = (side) => [
  side?.appKitChain,
  side?.networkName,
  side?.chainId,
].map(normalizeKey).filter(Boolean);

const feeMatchesSide = (fee, side, sideName) => {
  const feeCandidates = feeChainCandidates(fee);
  const sideCandidates = routeSideCandidates(side);
  if (feeCandidates.some((candidate) => sideCandidates.includes(candidate))) return true;

  if (!feeCandidates.length) {
    const operation = normalizeKey(
      fee?.step || fee?.method || fee?.action || fee?.name || fee?.label || fee?.type,
    );
    if (sideName === 'source' && /(approve|approval|burn|deposit)/.test(operation)) return true;
    if (sideName === 'destination' && /(mint|receive|destination)/.test(operation)) return true;
  }

  return false;
};

const estimateGasFeeRecords = (estimate) => {
  if (Array.isArray(estimate?.gasFees) && estimate.gasFees.length) return estimate.gasFees;
  if (estimate?.gasFees && typeof estimate.gasFees === 'object') {
    const values = Object.values(estimate.gasFees).filter(Boolean);
    if (values.length) return values;
  }
  return (Array.isArray(estimate?.fees) ? estimate.fees : [])
    .filter((fee) => /gas/i.test(clean(fee?.type || fee?.name || fee?.label)));
};

const resolveGasFeeRecordsForSide = ({ estimate, route, sideName }) => {
  const records = estimateGasFeeRecords(estimate);
  const side = route?.[sideName];
  const explicitMatches = records.filter((fee) => feeMatchesSide(fee, side, sideName));
  if (explicitMatches.length) return explicitMatches;

  // Some SDK versions return exactly two unlabelled gas entries in source ->
  // destination order. This fallback is deliberately narrow; anything more
  // ambiguous fails closed instead of guessing before a user signs.
  const allUnlabelled = records.length === 2 && records.every((fee) => !feeChainCandidates(fee).length);
  if (allUnlabelled) return [records[sideName === 'source' ? 0 : 1]];

  return [];
};

const circleGasRequirementForSide = ({ estimate, route, sideName, decimals }) => {
  const side = route?.[sideName];
  const records = resolveGasFeeRecordsForSide({ estimate, route, sideName });
  let estimatedRaw = 0n;

  for (const record of records) {
    // Circle Bridge/App Kit 1.15.x returns gas rows in the form:
    // { name, blockchain, token, fees: { fee } }. Older versions exposed a
    // flatter amount/fee/value shape, so feeAmount() intentionally supports both.
    const amount = feeAmount(record);
    if (!positiveDecimal(amount)) continue;
    const token = normalizeKey(feeToken(record));
    const expectedToken = normalizeKey(side?.nativeSymbol);
    if (token && expectedToken && token !== expectedToken) continue;
    try {
      estimatedRaw += parseUnits(amount, decimals);
    } catch {
      // Ignore malformed individual entries; RPC fallback is used if nothing usable remains.
    }
  }

  if (estimatedRaw <= 0n) return null;

  const requiredRaw = withGasBuffer(estimatedRaw);
  return {
    estimatedRaw,
    requiredRaw,
    estimated: formatUnits(estimatedRaw, decimals),
    required: formatUnits(requiredRaw, decimals),
    bufferPercent: Number((GAS_BUFFER_BPS - BPS_DENOMINATOR) / 100n),
    records,
    method: 'circle',
    methodLabel: 'Circle gas estimate',
  };
};

const fallbackGasUnitsForSide = (sideName) => Number(
  sideName === 'source'
    ? web3Config.usdcBridge.fallbackSourceGasUnits
    : web3Config.usdcBridge.fallbackDestinationGasUnits,
);

const gasRequirementForSide = async ({ estimate, route, sideName, decimals }) => {
  const side = route?.[sideName];
  const circleRequirement = circleGasRequirementForSide({ estimate, route, sideName, decimals });
  if (circleRequirement) return circleRequirement;

  const fallbackGasUnits = fallbackGasUnitsForSide(sideName);
  try {
    const rpcBudget = await estimateWalletNativeGasBudget({
      chainId: side?.chainId,
      gasUnits: fallbackGasUnits,
    });
    const requiredRaw = withGasBuffer(rpcBudget.estimatedRaw);
    return {
      estimatedRaw: rpcBudget.estimatedRaw,
      requiredRaw,
      estimated: formatUnits(rpcBudget.estimatedRaw, decimals),
      required: formatUnits(requiredRaw, decimals),
      bufferPercent: Number((GAS_BUFFER_BPS - BPS_DENOMINATOR) / 100n),
      records: [],
      method: 'rpc-fallback',
      methodLabel: 'RPC safety reserve',
      fallbackGasUnits: rpcBudget.gasUnits,
      feeSource: rpcBudget.feeSource,
    };
  } catch (error) {
    throw new Error(
      `Unable to verify the required ${side?.nativeSymbol || 'native token'} gas on ${side?.networkName || sideName}. `
      + `Circle did not provide a usable gas amount and the RPC fallback could not calculate a safe reserve. ${clean(error?.message || error) || 'Try again shortly.'}`,
    );
  }
};

export const getUsdcBridgeConfigurationIssue = (routeId = '') => {
  const environment = clean(web3Config.usdcBridge?.environment).toLowerCase();
  const supportedChains = BRIDGE_CHAINS_BY_ENVIRONMENT[environment];

  if (!supportedChains) {
    return `USDC bridge environment "${environment || 'missing'}" is not supported. Use mainnet or testnet.`;
  }

  const routes = web3Config.usdcBridge?.routes || {};
  const routesToValidate = routeId ? [routes[routeId]] : Object.values(routes);
  if (routeId && !routes[routeId]) return `USDC bridge route "${routeId}" is not configured.`;
  if (!routesToValidate.length) return 'No USDC bridge routes are configured.';

  for (const route of routesToValidate) {
    if (!route?.source?.appKitChain || !route?.destination?.appKitChain) {
      return `USDC bridge route "${route?.id || routeId || 'unknown'}" is incomplete.`;
    }
    if (!supportedChains.has(route.source.appKitChain)) {
      return `Circle bridge source chain "${route.source.appKitChain}" does not match the ${environment} profile.`;
    }
    if (!supportedChains.has(route.destination.appKitChain)) {
      return `Circle bridge destination chain "${route.destination.appKitChain}" does not match the ${environment} profile.`;
    }
  }

  return '';
};

export const getUsdcBridgeRoute = (routeId) => {
  const route = web3Config.usdcBridge?.routes?.[routeId];
  if (!route?.source?.appKitChain || !route?.destination?.appKitChain) {
    throw new Error('This USDC bridge direction is not configured.');
  }
  const configurationIssue = getUsdcBridgeConfigurationIssue(routeId);
  if (configurationIssue) throw new Error(configurationIssue);
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
    // Keep Privy confirmations explicit and let App Kit execute the regular
    // source burn + destination mint flow. No forwarding/relayer is enabled.
    batchTransactions: false,
  },
});

const normalizeBridgeSdkError = (error, route) => {
  const message = clean(error?.shortMessage || error?.message || error);
  if (/invalid chain/i.test(message) || /not supported for bridging/i.test(message)) {
    return new Error(
      `Circle bridge support for ${route.source.networkName} -> ${route.destination.networkName} is not available in this deployed build. Reinstall the current Circle SDK dependencies and rebuild the ${web3Config.usdcBridge.environment} frontend.`,
    );
  }
  return error instanceof Error ? error : new Error(message || 'Unable to prepare this USDC bridge.');
};

const readFreshPreflightBalances = async ({ walletAddress, route }) => {
  if (!isAddress(clean(walletAddress))) throw new Error('The connected Privy wallet address is invalid.');

  const [sourceGas, destinationGas, sourceToken] = await Promise.all([
    readWalletNativeBalance({ walletAddress, chainId: route.source.chainId }),
    readWalletNativeBalance({ walletAddress, chainId: route.destination.chainId }),
    route.source.usdcIsNative
      ? Promise.resolve(null)
      : readWalletTokenBalance({
          tokenAddress: route.source.usdcAddress,
          walletAddress,
          chainId: route.source.chainId,
          decimals: 6,
        }),
  ]);

  return {
    sourceGas,
    destinationGas,
    sourceToken: route.source.usdcIsNative
      ? {
          rawBalance: sourceGas.rawBalance,
          decimals: sourceGas.decimals,
          formatted: sourceGas.formatted,
        }
      : sourceToken,
  };
};

const validateFeeAmount = ({ amount, estimate }) => {
  const maxFee = clean(estimate?.maxFee || web3Config.usdcBridge.maxFee);
  if (positiveDecimal(maxFee)) {
    try {
      if (parseUnits(maxFee, 6) >= parseUnits(amount, 6)) {
        throw new Error(
          `The current maximum CCTP fee (${displayAmount(maxFee, 6)} USDC) must be lower than the bridge amount (${displayAmount(amount, 6)} USDC). Increase the bridge amount or wait for a lower fee.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && /maximum CCTP fee/i.test(error.message)) throw error;
    }
  }

  const amountReceivedValue = typeof estimate?.amountReceived === 'object'
    ? clean(estimate?.amountReceived?.amount ?? estimate?.amountReceived?.value)
    : clean(estimate?.amountReceived);
  if (amountReceivedValue && !positiveDecimal(amountReceivedValue)) {
    throw new Error('The current bridge quote would not mint a positive USDC amount on the destination network. No transaction was started.');
  }
};

export const validateUsdcBridgePreflight = async ({
  walletAddress,
  amount,
  route,
  estimate,
}) => {
  const normalizedAmount = clean(amount);
  if (!positiveDecimal(normalizedAmount)) throw new Error('Enter an amount greater than 0 USDC.');
  if (!route?.source || !route?.destination) throw new Error('Bridge route details are unavailable.');
  if (!estimate) throw new Error('A current Circle bridge estimate is required before signing.');

  validateFeeAmount({ amount: normalizedAmount, estimate });

  let balances;
  try {
    balances = await readFreshPreflightBalances({ walletAddress, route });
  } catch (error) {
    throw new Error(
      `Unable to verify current source and destination balances before signing. ${clean(error?.message || error) || 'Refresh and try again.'}`,
    );
  }

  const sourceTokenDecimals = Number(balances.sourceToken.decimals ?? 6);
  const requestedTokenRaw = parseUnits(normalizedAmount, sourceTokenDecimals);
  if (balances.sourceToken.rawBalance < requestedTokenRaw) {
    throw new Error(
      `Insufficient USDC on ${route.source.networkName}. You have ${displayAmount(balances.sourceToken.formatted, 6)} USDC but requested ${displayAmount(normalizedAmount, 6)} USDC.`,
    );
  }

  const [sourceGasRequirement, destinationGasRequirement] = await Promise.all([
    gasRequirementForSide({
      estimate,
      route,
      sideName: 'source',
      decimals: balances.sourceGas.decimals,
    }),
    gasRequirementForSide({
      estimate,
      route,
      sideName: 'destination',
      decimals: balances.destinationGas.decimals,
    }),
  ]);

  if (balances.sourceGas.rawBalance < sourceGasRequirement.requiredRaw) {
    throw new Error(
      `Insufficient gas on ${route.source.networkName}. Available: ${displayAmount(balances.sourceGas.formatted, 8)} ${route.source.nativeSymbol}. `
      + `Required before signing: about ${displayAmount(sourceGasRequirement.required, 8)} ${route.source.nativeSymbol} including a 25% safety buffer (${sourceGasRequirement.methodLabel}).`,
    );
  }

  if (route.source.usdcIsNative) {
    const bridgeAmountInNativeUnits = parseUnits(normalizedAmount, balances.sourceGas.decimals);
    const totalRequired = bridgeAmountInNativeUnits + sourceGasRequirement.requiredRaw;
    if (balances.sourceGas.rawBalance < totalRequired) {
      throw new Error(
        `${route.source.networkName} uses ${route.source.nativeSymbol} for both the bridge amount and gas. `
        + `You have ${displayAmount(balances.sourceGas.formatted, 8)} ${route.source.nativeSymbol}, but approximately `
        + `${displayAmount(formatUnits(totalRequired, balances.sourceGas.decimals), 8)} ${route.source.nativeSymbol} is required for the bridge amount plus source gas. Reduce the amount or add funds.`,
      );
    }
  }

  if (balances.destinationGas.rawBalance < destinationGasRequirement.requiredRaw) {
    throw new Error(
      `Insufficient destination gas on ${route.destination.networkName}. Available: ${displayAmount(balances.destinationGas.formatted, 8)} ${route.destination.nativeSymbol}. `
      + `The destination mint is submitted by your wallet and needs about ${displayAmount(destinationGasRequirement.required, 8)} ${route.destination.nativeSymbol} including a 25% safety buffer (${destinationGasRequirement.methodLabel}). Add ${route.destination.nativeSymbol} on ${route.destination.networkName} before bridging.`,
    );
  }

  return {
    ok: true,
    checkedAt: Date.now(),
    sourceToken: {
      balance: balances.sourceToken.formatted,
      required: normalizedAmount,
      symbol: 'USDC',
    },
    sourceGas: {
      balance: balances.sourceGas.formatted,
      estimated: sourceGasRequirement.estimated,
      required: sourceGasRequirement.required,
      symbol: route.source.nativeSymbol,
      networkName: route.source.networkName,
      method: sourceGasRequirement.method,
      methodLabel: sourceGasRequirement.methodLabel,
      fallbackGasUnits: sourceGasRequirement.fallbackGasUnits || null,
    },
    destinationGas: {
      balance: balances.destinationGas.formatted,
      estimated: destinationGasRequirement.estimated,
      required: destinationGasRequirement.required,
      symbol: route.destination.nativeSymbol,
      networkName: route.destination.networkName,
      method: destinationGasRequirement.method,
      methodLabel: destinationGasRequirement.methodLabel,
      fallbackGasUnits: destinationGasRequirement.fallbackGasUnits || null,
    },
    safetyBufferPercent: 25,
  };
};

export const createUsdcBridgeSession = async ({ provider, walletAddress, amount, routeId }) => {
  if (!provider?.request) throw new Error('Your Privy secure account provider is unavailable.');
  if (!clean(amount)) throw new Error('Enter a USDC amount to bridge.');
  if (!isAddress(clean(walletAddress))) throw new Error('Your Privy wallet address is unavailable.');

  const route = getUsdcBridgeRoute(routeId);
  const adapter = await createViemAdapterFromProvider({ provider });
  const kit = new AppKit();
  const params = bridgeParams({ adapter, amount, route });

  try {
    // estimateBridge is read/simulation-only. It does not submit or sign a wallet
    // transaction. Circle gas rows are preferred; if a row is unavailable we use
    // current RPC fee data plus a conservative configured gas-unit reserve.
    const estimate = await kit.estimateBridge(params);
    const preflight = await validateUsdcBridgePreflight({
      walletAddress,
      amount,
      route,
      estimate,
    });

    return {
      adapter,
      kit,
      params,
      estimate,
      preflight,
      route,
      routeId,
      walletAddress,
      amount: clean(amount),
    };
  } catch (error) {
    throw normalizeBridgeSdkError(error, route);
  }
};

export const revalidateUsdcBridgeSession = async (session) => {
  if (!session?.kit || !session?.params || !session?.route || !session?.walletAddress) {
    throw new Error('Bridge review expired. Review the bridge again before confirming.');
  }

  try {
    // Repeat both the Circle estimate and fresh source/destination balance checks
    // immediately before bridge(). If anything changed, execution stops here and
    // Privy never receives a transaction request.
    const estimate = await session.kit.estimateBridge(session.params);
    const preflight = await validateUsdcBridgePreflight({
      walletAddress: session.walletAddress,
      amount: session.amount || session.params.amount,
      route: session.route,
      estimate,
    });
    return { ...session, estimate, preflight };
  } catch (error) {
    throw normalizeBridgeSdkError(error, session.route);
  }
};

const failedBridgeStep = (result) =>
  (Array.isArray(result?.steps) ? result.steps : []).find((step) => step?.error);

export const executeUsdcBridgeSession = async ({ session, onEvent }) => {
  if (!session?.kit || !session?.adapter || !session?.params || !session?.preflight?.ok) {
    throw new Error('Bridge validation is incomplete. Review the bridge again before confirming.');
  }

  const handler = (payload) => onEvent?.(payload);
  session.kit.on('*', handler);

  try {
    let result = await session.kit.bridge(session.params);
    const failedStep = failedBridgeStep(result);

    // Resume only the SDK's existing CCTP operation when App Kit explicitly marks
    // it retryable. Never create a second unrelated burn for a pending transfer.
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
