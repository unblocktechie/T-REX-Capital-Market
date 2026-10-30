import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  isAddress,
} from 'viem';
import controllerAbi from '@/abi/TREXPlatformController.json';
import { requirePaymentToken } from '@/api/tokens/paymentTokens.api';
import { parseExactUnits } from '@/utils/paymentAmounts';
import { web3Config } from '@/config/web3';
import { formatNativeWalletBalance } from '@/utils/wallet';

const MAX_UINT256 = (1n << 256n) - 1n;
// The app always grants MAX_UINT256 when the investor explicitly enables payment token
// spending. Some ERC-20 implementations decrement an unlimited allowance while
// others leave MAX_UINT256 untouched, so treat any allowance that is still in
// the upper half of uint256 as the same persistent, one-time approval.
const PERSISTENT_ALLOWANCE_THRESHOLD = MAX_UINT256 >> 1n;

export const TREX_PLATFORM_CONTROLLER_ABI = controllerAbi;
export const LEGACY_PLATFORM_CONTROLLER_ABI = [
  {
    type: 'function',
    name: 'paymentToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenPrice',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setPrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'newPrice', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getTokenInfo',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'issuer', type: 'address' },
      { name: 'tokenDecimals', type: 'uint8' },
      { name: 'price', type: 'uint256' },
      { name: 'controllerIsAgent', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokenAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'paymentAmount', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'tokenDecimals', type: 'uint8' },
      { name: 'issuer', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'quoteRedeem',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokenAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'paymentAmount', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'tokenDecimals', type: 'uint8' },
      { name: 'issuer', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokenAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'redeem',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'investor', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'tokenAmount', type: 'uint256' },
    ],
    outputs: [],
  },
];

const ERC20_PAYMENT_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
];

const clean = (value) => String(value ?? '').trim();
const requiredConfirmationsFor = (chainId) =>
  web3Config.getChainRecordById(chainId)?.requiredConfirmations || 1;

const walletErrorCode = (error) =>
  error?.code
  ?? error?.cause?.code
  ?? error?.data?.originalError?.code
  ?? error?.cause?.data?.originalError?.code;

const walletErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isPlatformWalletRejection = (error) =>
  walletErrorCode(error) === 4001
  || /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

const requiredAddress = (value, label) => {
  const normalized = clean(value);
  if (!isAddress(normalized, { strict: false })) {
    const error = new Error(`${label} is unavailable. Refresh the page and try again.`);
    error.code = 'INVALID_PLATFORM_ADDRESS';
    throw error;
  }
  return getAddress(normalized.toLowerCase());
};

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return Number(value);
};

const chainFor = (value) => {
  const chainId = parseChainId(value || web3Config.requiredChain.id);
  const chain = web3Config.supportedChains.find((candidate) => candidate.id === chainId);
  if (!chain) {
    const error = new Error('This action cannot be completed with the current secure account settings.');
    error.code = 'UNSUPPORTED_CHAIN';
    throw error;
  }
  return chain;
};

const publicClientCache = new Map();

const publicClientFor = (chainId) => {
  const chain = chainFor(chainId);
  const cached = publicClientCache.get(chain.id);
  if (cached) return cached;

  const rpcUrl = web3Config.getChainRecordById(chain.id)?.publicRpcUrl;
  if (!rpcUrl) throw new Error('The public RPC URL for this network is unavailable.');
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  publicClientCache.set(chain.id, client);
  return client;
};

export const platformControllerAddress = (chainId = web3Config.requiredChain.id) => requiredAddress(
  web3Config.getChainRecordById(chainId)?.platformControllerAddress,
  'Platform Controller',
);

const activeWallet = async ({ connector, connectedAddress, expectedAddress, chainId, purpose }) => {
  if (!connector?.getProvider || !isAddress(connectedAddress || '')) {
    const error = new Error(`Connect the required wallet before ${purpose}.`);
    error.code = 'WALLET_NOT_CONNECTED';
    throw error;
  }

  const chain = chainFor(chainId);
  const expected = requiredAddress(expectedAddress, 'Required wallet');
  const connected = getAddress(connectedAddress);
  const provider = await connector.getProvider();
  if (!provider?.request) {
    const error = new Error('The connected wallet is unavailable. Reconnect it and try again.');
    error.code = 'WALLET_PROVIDER_UNAVAILABLE';
    throw error;
  }

  const accounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(providerAddress || '')) {
    const error = new Error('Reconnect the required wallet before continuing.');
    error.code = 'WALLET_NOT_CONNECTED';
    throw error;
  }

  const account = getAddress(providerAddress);
  if (account !== expected) {
    const error = new Error('Switch to the wallet assigned to this account before continuing.');
    error.code = 'WALLET_MISMATCH';
    error.expectedAddress = expected;
    throw error;
  }
  if (account !== connected) {
    const error = new Error('Your active wallet account changed. Reconnect the correct wallet and try again.');
    error.code = 'WALLET_ACCOUNT_CHANGED';
    throw error;
  }

  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== chain.id) {
    const error = new Error(`Switch your wallet to ${chain.name} and try again.`);
    error.code = 'WRONG_WALLET_NETWORK';
    error.requiredChainId = chain.id;
    throw error;
  }

  return {
    provider,
    chain,
    account,
    walletClient: createWalletClient({ account, chain, transport: custom(provider) }),
    publicClient: publicClientFor(chain.id),
  };
};

// RPC failures must not silently select a legacy transaction signature.
const controllerMetadata = async (publicClient, controllerAddress, paymentTokenAddress, action) => {
  const controller = requiredAddress(controllerAddress, 'Asset Platform Controller');
  const paymentToken = requiredAddress(paymentTokenAddress, 'Asset payment token');
  let priceDecimals;
  try {
    priceDecimals = Number(await publicClient.readContract({ address: controller, abi: controllerAbi, functionName: 'PRICE_DECIMALS' }));
  } catch (error) {
    let cause = error;
    let missingFunction = false;
    while (cause) {
      if (['ContractFunctionZeroDataError', 'ContractFunctionRevertedError'].includes(cause.name)) missingFunction = true;
      cause = cause.cause;
    }
    if (!missingFunction) throw error;
    const legacyToken = await publicClient.readContract({ address: controller, abi: LEGACY_PLATFORM_CONTROLLER_ABI, functionName: 'paymentToken' });
    if (requiredAddress(legacyToken, 'Legacy payment token') !== paymentToken) throw new Error('The saved currency does not match this legacy controller.');
    return { controller, paymentToken, priceDecimals: null, legacy: true, abi: LEGACY_PLATFORM_CONTROLLER_ABI };
  }
  if (!Number.isInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) throw new Error('Invalid controller price precision.');
  if (action !== 'price') {
    const supported = await publicClient.readContract({ address: controller, abi: controllerAbi, functionName: 'isPaymentToken', args: [paymentToken] });
    if (!supported) throw new Error('The asset payment token is no longer accepted by its controller.');
  }
  return { controller, paymentToken, priceDecimals, legacy: false, abi: controllerAbi };
};

const PAYMENT_METADATA_TTL_MS = 30_000;
const paymentMetadataCache = new Map();

const paymentTokenMetadata = async (publicClient, { controllerAddress, paymentTokenAddress, chainId, action = 'buy' }) => {
  const cacheKey = [
    Number(chainId) || '',
    clean(controllerAddress).toLowerCase(),
    clean(paymentTokenAddress).toLowerCase(),
    clean(action).toLowerCase(),
  ].join(':');
  const cached = paymentMetadataCache.get(cacheKey);
  if (cached?.value && Date.now() - cached.cachedAt <= PAYMENT_METADATA_TTL_MS) {
    return cached.value;
  }
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const item = await requirePaymentToken({ paymentTokenAddress, chainId, action });

    // Transaction-facing token/application responses should carry the controller,
    // but older records can legitimately be missing it. Recover deterministically
    // from the authoritative selected-chain payment-token data first, then from the platform
    // default used by current deployments. A valid asset-specific controller still
    // wins when it is present, so existing assets are not silently retargeted.
    const savedController = isAddress(clean(controllerAddress), { strict: false })
      ? getAddress(clean(controllerAddress).toLowerCase())
      : '';
    const catalogueController = isAddress(clean(item.controllerAddress), { strict: false })
      ? getAddress(clean(item.controllerAddress).toLowerCase())
      : '';
    const configuredController = optionalAddress(web3Config.getChainRecordById(chainId)?.platformControllerAddress);
    const resolvedController = savedController || catalogueController || configuredController;

    const config = await controllerMetadata(publicClient, resolvedController, item.contractAddress, action);
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({ address: config.paymentToken, abi: ERC20_PAYMENT_ABI, functionName: 'decimals' }),
      publicClient.readContract({ address: config.paymentToken, abi: ERC20_PAYMENT_ABI, functionName: 'symbol' }),
    ]);
    if (Number(decimals) !== item.decimals || clean(symbol) !== item.symbol) throw new Error('Payment token metadata differs from the catalogue. Please contact support.');
    return {
      ...config,
      priceDecimals: config.legacy ? Number(decimals) : config.priceDecimals,
      paymentTokenDecimals: Number(decimals),
      paymentTokenSymbol: clean(symbol),
    };
  })();

  paymentMetadataCache.set(cacheKey, {
    value: cached?.value || null,
    cachedAt: cached?.cachedAt || 0,
    promise,
  });

  try {
    const value = await promise;
    paymentMetadataCache.set(cacheKey, {
      value,
      cachedAt: Date.now(),
      promise: null,
    });
    return value;
  } catch (error) {
    paymentMetadataCache.delete(cacheKey);
    throw error;
  }
};

const optionalAddress = (value) => {
  const normalized = clean(value);
  return isAddress(normalized, { strict: false })
    ? getAddress(normalized.toLowerCase())
    : '';
};

const isMissingContractFunction = (error) => {
  let cause = error;
  while (cause) {
    if (['ContractFunctionZeroDataError', 'ContractFunctionRevertedError'].includes(cause.name)) {
      return true;
    }
    cause = cause.cause;
  }
  return false;
};

// Price reads/writes only need the controller and token address. Requiring the
// payment-token catalogue here made token creation fail even when setPrice itself
// was valid on-chain (for example while the backend token/payment record was still
// being finalized). Keep purchase/redemption catalogue checks strict, but make the
// price-confirmation path depend only on authoritative on-chain controller state.
const priceControllerMetadata = async (publicClient, {
  controllerAddress,
  paymentTokenAddress,
  chainId,
}) => {
  let paymentToken = optionalAddress(paymentTokenAddress);
  let resolvedController = optionalAddress(controllerAddress);

  // Preserve support for older records that only saved the payment-token address:
  // if no asset controller is present, the catalogue may still identify it. A
  // catalogue lookup failure must not block a modern price read/write because the
  // configured controller remains the deterministic deployment fallback.
  if (!resolvedController && paymentToken && chainId) {
    try {
      const item = await requirePaymentToken({
        paymentTokenAddress: paymentToken,
        chainId,
        action: 'price',
      });
      resolvedController = optionalAddress(item.controllerAddress);
      paymentToken = optionalAddress(item.contractAddress) || paymentToken;
    } catch {
      // Continue to the configured controller fallback below.
    }
  }

  const controller = requiredAddress(
    resolvedController || optionalAddress(web3Config.getChainRecordById(chainId)?.platformControllerAddress),
    'Asset Platform Controller',
  );

  try {
    const priceDecimals = Number(await publicClient.readContract({
      address: controller,
      abi: controllerAbi,
      functionName: 'PRICE_DECIMALS',
    }));
    if (!Number.isInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) {
      throw new Error('Invalid controller price precision.');
    }
    return {
      controller,
      paymentToken,
      paymentTokenDecimals: null,
      paymentTokenSymbol: '',
      priceDecimals,
      legacy: false,
      abi: controllerAbi,
    };
  } catch (error) {
    if (!isMissingContractFunction(error)) throw error;
  }

  // Legacy controllers do not expose PRICE_DECIMALS. Their own paymentToken()
  // value is authoritative, so recover it directly instead of depending on the
  // backend catalogue during token finalization.
  const legacyPaymentToken = await publicClient.readContract({
    address: controller,
    abi: LEGACY_PLATFORM_CONTROLLER_ABI,
    functionName: 'paymentToken',
  });
  paymentToken = requiredAddress(legacyPaymentToken, 'Legacy payment token');
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: paymentToken,
      abi: ERC20_PAYMENT_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: paymentToken,
      abi: ERC20_PAYMENT_ABI,
      functionName: 'symbol',
    }),
  ]);
  const priceDecimals = Number(decimals);
  if (!Number.isInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) {
    throw new Error('Invalid controller price precision.');
  }
  return {
    controller,
    paymentToken,
    paymentTokenDecimals: priceDecimals,
    paymentTokenSymbol: clean(symbol),
    priceDecimals,
    legacy: true,
    abi: LEGACY_PLATFORM_CONTROLLER_ABI,
  };
};

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const readPlatformTokenPriceRaw = async ({
  publicClient,
  controller,
  abi,
  token,
  blockNumber,
}) => BigInt(await publicClient.readContract({
  address: controller,
  abi,
  functionName: 'tokenPrice',
  args: [token],
  ...(typeof blockNumber === 'bigint' ? { blockNumber } : {}),
}));

const readLatestPlatformTokenPriceRaw = async ({
  publicClient,
  controller,
  abi,
  token,
  attempts = 3,
}) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await readPlatformTokenPriceRaw({ publicClient, controller, abi, token });
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(450 * (attempt + 1));
    }
  }
  throw lastError;
};

const waitForExpectedPlatformTokenPriceRaw = async ({
  publicClient,
  controller,
  abi,
  token,
  expectedRaw,
  attempts = 8,
}) => {
  let lastError = null;
  let lastObservedRaw = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastObservedRaw = await readPlatformTokenPriceRaw({
        publicClient,
        controller,
        abi,
        token,
      });
      if (lastObservedRaw === expectedRaw) {
        return { matched: true, priceRaw: lastObservedRaw, error: null };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await sleep(Math.min(1_800, 600 * (attempt + 1)));
    }
  }

  return { matched: false, priceRaw: lastObservedRaw, error: lastError };
};

const normalizeDecimalPrice = (value) => {
  const normalized = clean(value).replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized) || !/[1-9]/.test(normalized)) {
    const error = new Error('Enter a price greater than zero with no more than 18 decimal places.');
    error.code = 'INVALID_PRICE';
    throw error;
  }
  return normalized;
};

const resolveTokenAmountRaw = async ({
  publicClient,
  controller,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
}) => {
  const token = requiredAddress(tokenAddress, 'Token contract');
  const info = await publicClient.readContract({
    address: controller,
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName: 'getTokenInfo',
    args: [token],
  });
  const [issuer, tokenDecimalsValue, price, controllerIsAgent] = info;
  const tokenDecimals = Number(tokenDecimalsValue);

  if (!controllerIsAgent) {
    const error = new Error('This token is not yet enabled for platform purchases and redemptions. Ask the issuer to complete the token setup.');
    error.code = 'PLATFORM_CONTROLLER_NOT_AGENT';
    throw error;
  }
  if (!price || BigInt(price) <= 0n) {
    const error = new Error('The current token price is not active yet. Please try again after the issuer updates the price.');
    error.code = 'TOKEN_PRICE_NOT_SET';
    throw error;
  }
  if (!Number.isSafeInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) {
    const error = new Error('The token decimals could not be verified. Please try again.');
    error.code = 'INVALID_TOKEN_DECIMALS';
    throw error;
  }

  const rawCandidate = clean(tokenAmountRaw);
  let rawAmount;
  if (/^\d+$/.test(rawCandidate) && BigInt(rawCandidate) > 0n) {
    rawAmount = BigInt(rawCandidate);
  } else {
    const amount = clean(tokenAmount);
    if (!/^\d+(?:\.\d+)?$/.test(amount) || !/[1-9]/.test(amount)) {
      const error = new Error('The token amount could not be verified. Refresh the page and try again.');
      error.code = 'INVALID_TOKEN_AMOUNT';
      throw error;
    }
    try {
      rawAmount = parseExactUnits(amount, tokenDecimals);
    } catch {
      const error = new Error(`Enter no more than ${tokenDecimals} decimal places for this token.`);
      error.code = 'INVALID_TOKEN_AMOUNT';
      throw error;
    }
  }

  if (rawAmount <= 0n || rawAmount > MAX_UINT256) {
    const error = new Error('Enter a token amount greater than zero.');
    error.code = 'INVALID_TOKEN_AMOUNT';
    throw error;
  }

  return {
    token,
    rawAmount,
    issuer: getAddress(issuer),
    tokenDecimals,
    price: BigInt(price),
    controllerIsAgent: Boolean(controllerIsAgent),
  };
};

const quoteOperation = async ({ mode, chainId, tokenAddress, tokenAmountRaw, tokenAmount, controllerAddress, paymentTokenAddress }) => {
  const chain = chainFor(chainId);
  const publicClient = publicClientFor(chain.id);
  const metadata = await paymentTokenMetadata(publicClient, { controllerAddress, paymentTokenAddress, chainId: chain.id, action: mode });
  const { controller, paymentToken, paymentTokenDecimals, paymentTokenSymbol, priceDecimals, abi, legacy } = metadata;
  const [paused, tokenInfo] = await Promise.all([
    publicClient.readContract({ address: controller, abi: controllerAbi, functionName: 'paused' }),
    resolveTokenAmountRaw({
      publicClient,
      controller,
      tokenAddress,
      tokenAmountRaw,
      tokenAmount,
    }),
  ]);
  if (paused) throw new Error('Purchases and redemptions are temporarily paused.');
  const functionName = mode === 'redeem' ? 'quoteRedeem' : 'quoteBuy';
  const quote = await publicClient.readContract({
    address: controller,
    abi,
    functionName,
    args: legacy ? [tokenInfo.token, tokenInfo.rawAmount] : [tokenInfo.token, paymentToken, tokenInfo.rawAmount],
  });
  const [paymentAmountValue, priceValue, quoteTokenDecimalsValue, issuerValue] = quote;
  const paymentAmount = BigInt(paymentAmountValue);
  const price = BigInt(priceValue);
  const quoteTokenDecimals = Number(quoteTokenDecimalsValue);
  const issuer = getAddress(issuerValue);


  if (issuer !== tokenInfo.issuer || quoteTokenDecimals !== tokenInfo.tokenDecimals || price !== tokenInfo.price) {
    const error = new Error('The investment price changed while this action was being prepared. Refresh and try again.');
    error.code = 'PLATFORM_QUOTE_CHANGED';
    throw error;
  }
  if (paymentAmount <= 0n) {
    const error = new Error('The payment amount could not be calculated for this token amount.');
    error.code = 'INVALID_PAYMENT_AMOUNT';
    throw error;
  }

  return {
    chain,
    publicClient,
    controller,
    paymentToken,
    paymentTokenDecimals,
    paymentTokenSymbol,
    priceDecimals, abi, legacy,
    tokenAddress: tokenInfo.token,
    tokenAmountRaw: tokenInfo.rawAmount,
    tokenDecimals: tokenInfo.tokenDecimals,
    issuer,
    price,
    paymentAmount,
    tokenAmount: formatUnits(tokenInfo.rawAmount, tokenInfo.tokenDecimals),
    priceFormatted: formatUnits(price, priceDecimals),
    paymentAmountFormatted: formatUnits(paymentAmount, paymentTokenDecimals),
  };
};

export const quotePlatformPurchase = (input) => quoteOperation({ ...input, mode: 'buy' });
export const quotePlatformRedemption = (input) => quoteOperation({ ...input, mode: 'redeem' });

const ensureNativeFeeBalance = async ({ publicClient, address, chain, paymentTokenSymbol = 'payment token', nativeBalance: knownNativeBalance }) => {
  const nativeBalance = typeof knownNativeBalance === 'bigint'
    ? knownNativeBalance
    : await publicClient.getBalance({ address });
  if (nativeBalance > 0n) return nativeBalance;

  const nativeSymbol = chain.nativeCurrency.symbol;
  const error = new Error(`Your wallet needs ${nativeSymbol} to cover the network fee for this transaction.`);
  error.code = 'INSUFFICIENT_NATIVE_BALANCE';
  error.fundingIssue = {
    type: 'gas',
    nativeInsufficient: true,
    paymentSymbol: paymentTokenSymbol,
    walletAddress: address,
    networkName: chain.name,
    nativeSymbol,
    nativeBalanceLabel: `0 ${nativeSymbol}`,
  };
  throw error;
};

const paymentAccountState = async ({ quote, owner }) => {
  const ownerAddress = requiredAddress(owner, 'Payment wallet');
  const [allowance, balance] = await Promise.all([
    quote.publicClient.readContract({
      address: quote.paymentToken,
      abi: ERC20_PAYMENT_ABI,
      functionName: 'allowance',
      args: [ownerAddress, quote.controller],
    }),
    quote.publicClient.readContract({
      address: quote.paymentToken,
      abi: ERC20_PAYMENT_ABI,
      functionName: 'balanceOf',
      args: [ownerAddress],
    }),
  ]);
  return {
    allowance: BigInt(allowance),
    balance: BigInt(balance),
    allowanceSufficient: BigInt(allowance) >= quote.paymentAmount,
    balanceSufficient: BigInt(balance) >= quote.paymentAmount,
    allowanceFormatted: formatUnits(BigInt(allowance), quote.paymentTokenDecimals),
    balanceFormatted: formatUnits(BigInt(balance), quote.paymentTokenDecimals),
  };
};

/**
 * Read an account's existing payment token approval for the Platform Controller.
 * When a required amount is supplied, any allowance that covers that action is
 * sufficient. Without an amount, only the reusable maximum-style approval is
 * treated as the completed one-time approval state.
 */
export async function getPlatformPaymentApprovalState({
  controllerAddress,
  paymentTokenAddress,
  chainId,
  owner,
  requiredAmountRaw,
}) {
  const chain = chainFor(chainId);
  const publicClient = publicClientFor(chain.id);
  const { controller, paymentToken } = await paymentTokenMetadata(publicClient, { controllerAddress, paymentTokenAddress, chainId: chain.id });
  const ownerAddress = requiredAddress(owner, 'Payment wallet');
  const allowance = BigInt(await publicClient.readContract({
    address: paymentToken,
    abi: ERC20_PAYMENT_ABI,
    functionName: 'allowance',
    args: [ownerAddress, controller],
  }));
  const requiredText = clean(requiredAmountRaw);
  const requiredAmount = /^\d+$/.test(requiredText) ? BigInt(requiredText) : null;
  const allowanceSufficient = requiredAmount === null
    ? allowance >= PERSISTENT_ALLOWANCE_THRESHOLD
    : allowance >= requiredAmount;

  return {
    chain,
    controller,
    paymentToken,
    allowance,
    requiredAmount,
    allowanceSufficient,
    persistentApprovalActive: allowance >= PERSISTENT_ALLOWANCE_THRESHOLD,
    // When a concrete action amount is known, any existing allowance that is
    // large enough is valid. Otherwise the UI only treats the app's maximum
    // approval as the reusable one-time approval state.
    spendingApproved: allowanceSufficient,
  };
}

const approveMaximumAllowance = async ({
  walletClient,
  publicClient,
  account,
  paymentToken,
  controller,
  onStep,
}) => {
  const previousAllowance = BigInt(await publicClient.readContract({ address: paymentToken, abi: ERC20_PAYMENT_ABI, functionName: 'allowance', args: [account, controller] }));
  if (previousAllowance > 0n) {
    onStep?.({ stage: 'approval-reset-signature', message: 'Reset the existing allowance before granting a new payment permission.' });
    const reset = await publicClient.simulateContract({ account, address: paymentToken, abi: ERC20_PAYMENT_ABI, functionName: 'approve', args: [controller, 0n] });
    const resetHash = await walletClient.writeContract(reset.request);
    const resetReceipt = await publicClient.waitForTransactionReceipt({ hash: resetHash, confirmations: requiredConfirmationsFor(publicClient.chain?.id) });
    if (resetReceipt.status !== 'success') throw new Error('The previous allowance could not be reset. No payment was submitted.');
  }
  onStep?.({ stage: 'approval-signature', message: 'Approve payment token in your wallet.' });
  const simulation = await publicClient.simulateContract({
    account,
    address: paymentToken,
    abi: ERC20_PAYMENT_ABI,
    functionName: 'approve',
    args: [controller, MAX_UINT256],
  });
  const approvalTxHash = await walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'approval-confirming', txHash: approvalTxHash, message: 'Payment approval submitted. Waiting for confirmation.' });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: approvalTxHash,
    confirmations: requiredConfirmationsFor(publicClient.chain?.id),
  });
  if (receipt.status !== 'success') {
    const error = new Error('The payment permission was not confirmed. No investment or redemption was submitted.');
    error.code = 'PAYMENT_APPROVAL_REVERTED';
    error.transactionHash = approvalTxHash;
    throw error;
  }
  onStep?.({ stage: 'approval-confirmed', txHash: approvalTxHash, message: 'payment permission confirmed.' });
  return approvalTxHash;
};

/**
 * Complete only the payment token spending-approval step for purchases. This never
 * submits a token purchase. Once MAX_UINT256 has been confirmed on-chain, the
 * UI can enable the independent Purchase action and future purchases can reuse
 * the same approval.
 */
export async function approvePlatformPurchaseSpending({
  controllerAddress,
  paymentTokenAddress,
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  onStep,
}) {
  const investor = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  const chain = chainFor(chainId);
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: investor,
    chainId: chain.id,
    purpose: 'allowing payment token spending',
  });
  const { controller, paymentToken, paymentTokenSymbol } = await paymentTokenMetadata(wallet.publicClient, { controllerAddress, paymentTokenAddress, chainId: chain.id });
  const current = await getPlatformPaymentApprovalState({ chainId: chain.id, owner: investor, controllerAddress, paymentTokenAddress });

  if (current.spendingApproved) {
    return { ...current, paymentTokenSymbol, approvalTxHash: '', alreadyApproved: true };
  }

  await ensureNativeFeeBalance({
    publicClient: wallet.publicClient,
    address: investor,
    chain,
    paymentTokenSymbol,
  });

  const approvalTxHash = await approveMaximumAllowance({
    ...wallet,
    paymentToken,
    controller,
    onStep,
  });
  const refreshed = await getPlatformPaymentApprovalState({ chainId: chain.id, owner: investor, controllerAddress, paymentTokenAddress });
  if (!refreshed.spendingApproved) {
    const error = new Error('payment permission was confirmed, but the updated status could not be verified. Refresh and try again.');
    error.code = 'PAYMENT_APPROVAL_NOT_UPDATED';
    error.transactionHash = approvalTxHash;
    throw error;
  }

  return { ...refreshed, paymentTokenSymbol, approvalTxHash, alreadyApproved: false };
}

export async function submitPlatformPurchase({
  controllerAddress,
  paymentTokenAddress,
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
  expectedPaymentAmountRaw,
  onStep,
}) {
  const quote = await quotePlatformPurchase({ chainId, tokenAddress, tokenAmountRaw, tokenAmount, controllerAddress, paymentTokenAddress });
  const investor = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: investor,
    chainId: quote.chain.id,
    purpose: 'purchasing tokens',
  });
  const [paymentState, nativeBalance] = await Promise.all([
    paymentAccountState({ quote, owner: investor }),
    wallet.publicClient.getBalance({ address: investor }),
  ]);

  if (!paymentState.balanceSufficient) {
    const paymentSymbol = quote.paymentTokenSymbol || 'payment token';
    const nativeSymbol = quote.chain.nativeCurrency.symbol;
    const nativeInsufficient = nativeBalance === 0n;
    const error = new Error(`Your ${paymentSymbol} balance is too low for this purchase. Required: ${quote.paymentAmountFormatted} ${paymentSymbol}.`);
    error.code = nativeInsufficient ? 'INSUFFICIENT_WALLET_BALANCE' : 'INSUFFICIENT_INVESTOR_BALANCE';
    error.fundingIssue = {
      type: nativeInsufficient ? 'both' : 'payment',
      paymentInsufficient: true,
      nativeInsufficient,
      paymentSymbol,
      requiredPayment: quote.paymentAmountFormatted,
      availablePayment: paymentState.balanceFormatted,
      walletAddress: investor,
      networkName: quote.chain.name,
      nativeSymbol,
      nativeBalanceLabel: formatNativeWalletBalance(nativeBalance, nativeSymbol),
    };
    throw error;
  }

  await ensureNativeFeeBalance({
    publicClient: wallet.publicClient,
    address: investor,
    chain: quote.chain,
    paymentTokenSymbol: quote.paymentTokenSymbol,
    nativeBalance,
  });

  const expectedRaw = clean(expectedPaymentAmountRaw);
  if (/^\d+$/.test(expectedRaw) && BigInt(expectedRaw) !== quote.paymentAmount) {
    const error = new Error('The token price changed while this purchase was being prepared. Refresh the purchase and confirm the latest amount.');
    error.code = 'PURCHASE_PRICE_CHANGED';
    throw error;
  }

  if (!paymentState.allowanceSufficient) {
    const error = new Error('Allow payment token payments before you make this investment.');
    error.code = 'PAYMENT_APPROVAL_REQUIRED';
    throw error;
  }

  onStep?.({ stage: 'purchase-signature', message: 'Confirm the investment in your wallet.' });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: quote.controller,
    abi: quote.abi,
    functionName: 'buy',
    args: quote.legacy ? [quote.tokenAddress, quote.tokenAmountRaw] : [quote.tokenAddress, quote.paymentToken, quote.tokenAmountRaw],
  });
  const txHash = await wallet.walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'purchase-submitted', txHash, message: 'Investment submitted. Waiting for secure confirmation.' });

  return { txHash, quote };
}

export async function waitForPlatformTransactionReceipt({ txHash, chainId, timeout = 180_000 }) {
  const hash = clean(txHash);
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    const error = new Error('The confirmation ID is invalid.');
    error.code = 'INVALID_TRANSACTION_HASH';
    throw error;
  }

  try {
    const receipt = await publicClientFor(chainId).waitForTransactionReceipt({
      hash,
      confirmations: requiredConfirmationsFor(chainId),
      timeout,
    });
    if (receipt.status !== 'success') {
      const error = new Error('The action was confirmed but could not be completed.');
      error.code = 'PLATFORM_TRANSACTION_REVERTED';
      error.transactionHash = hash;
      error.transactionSubmitted = true;
      error.confirmedRevert = true;
      throw error;
    }
    return receipt;
  } catch (error) {
    if (error?.confirmedRevert) throw error;
    const pending = new Error('This action is still being confirmed. Please wait before trying again.', { cause: error });
    pending.code = 'PLATFORM_CONFIRMATION_PENDING';
    pending.transactionHash = hash;
    pending.transactionSubmitted = true;
    throw pending;
  }
}

export async function getPlatformRedemptionFunding({
  controllerAddress,
  paymentTokenAddress,
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
}) {
  const quote = await quotePlatformRedemption({ chainId, tokenAddress, tokenAmountRaw, tokenAmount, controllerAddress, paymentTokenAddress });
  const issuerState = await paymentAccountState({ quote, owner: quote.issuer });
  return {
    ...quote,
    issuerAllowance: issuerState.allowance,
    issuerBalance: issuerState.balance,
    issuerAllowanceSufficient: issuerState.allowanceSufficient,
    issuerBalanceSufficient: issuerState.balanceSufficient,
    issuerAllowanceFormatted: issuerState.allowanceFormatted,
    issuerBalanceFormatted: issuerState.balanceFormatted,
  };
}

export async function approvePlatformRedemptionFunding({
  controllerAddress,
  paymentTokenAddress,
  connector,
  connectedAddress,
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
  onStep,
}) {
  const funding = await getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount, controllerAddress, paymentTokenAddress });
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: funding.issuer,
    chainId: funding.chain.id,
    purpose: 'enabling redemption payments',
  });

  // Approval and funding are separate concerns. The issuer can grant the
  // one-time maximum allowance even if the wallet balance for this particular
  // redemption is not yet available. The issuer's redeem() call still checks
  // both the live allowance and balance before it is submitted.
  if (funding.issuerAllowanceSufficient) {
    return { approvalTxHash: '', funding, alreadyApproved: true };
  }

  await ensureNativeFeeBalance({
    publicClient: wallet.publicClient,
    address: funding.issuer,
    chain: funding.chain,
    paymentTokenSymbol: funding.paymentTokenSymbol,
  });

  const approvalTxHash = await approveMaximumAllowance({
    ...wallet,
    paymentToken: funding.paymentToken,
    controller: funding.controller,
    onStep,
  });
  const refreshed = await getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount, controllerAddress, paymentTokenAddress });
  if (!refreshed.issuerAllowanceSufficient) {
    const error = new Error('The payment token approval was confirmed, but the available allowance could not be verified. Refresh and try again.');
    error.code = 'ISSUER_ALLOWANCE_NOT_UPDATED';
    throw error;
  }
  return { approvalTxHash, funding: refreshed, alreadyApproved: false };
}

export async function submitPlatformRedemption({
  controllerAddress,
  paymentTokenAddress,
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
  expectedPaymentAmountRaw,
  onStep,
}) {
  const funding = await getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount, controllerAddress, paymentTokenAddress });
  if (expectedPaymentAmountRaw !== undefined && BigInt(expectedPaymentAmountRaw) !== funding.paymentAmount) {
    const error = new Error('The redemption price changed. Refresh and review the new payout before confirming.');
    error.code = 'REDEMPTION_PRICE_CHANGED';
    throw error;
  }
  const investor = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: funding.issuer,
    chainId: funding.chain.id,
    purpose: 'executing the redemption',
  });
  const nativeBalance = await wallet.publicClient.getBalance({ address: funding.issuer });

  if (!funding.issuerAllowanceSufficient) {
    const error = new Error('Allow payment token payments before completing this redemption.');
    error.code = 'ISSUER_ALLOWANCE_REQUIRED';
    throw error;
  }
  if (!funding.issuerBalanceSufficient) {
    const paymentSymbol = funding.paymentTokenSymbol || 'payment token';
    const nativeSymbol = funding.chain.nativeCurrency.symbol;
    const nativeInsufficient = nativeBalance === 0n;
    const error = new Error(`The organization wallet does not have enough ${paymentSymbol} for this redemption. Required: ${funding.paymentAmountFormatted} ${paymentSymbol}.`);
    error.code = nativeInsufficient ? 'INSUFFICIENT_WALLET_BALANCE' : 'INSUFFICIENT_ISSUER_BALANCE';
    error.fundingIssue = {
      type: nativeInsufficient ? 'both' : 'payment',
      paymentInsufficient: true,
      nativeInsufficient,
      paymentSymbol,
      requiredPayment: funding.paymentAmountFormatted,
      availablePayment: funding.issuerBalanceFormatted,
      walletAddress: funding.issuer,
      networkName: funding.chain.name,
      nativeSymbol,
      nativeBalanceLabel: formatNativeWalletBalance(nativeBalance, nativeSymbol),
    };
    throw error;
  }

  await ensureNativeFeeBalance({
    publicClient: wallet.publicClient,
    address: funding.issuer,
    chain: funding.chain,
    paymentTokenSymbol: funding.paymentTokenSymbol,
    nativeBalance,
  });

  const investorTokenBalance = BigInt(await funding.publicClient.readContract({
    address: funding.tokenAddress,
    abi: ERC20_PAYMENT_ABI,
    functionName: 'balanceOf',
    args: [investor],
  }));
  if (investorTokenBalance < funding.tokenAmountRaw) {
    const error = new Error(`The investor secure account no longer has enough asset units to complete this redemption. Available: ${formatUnits(investorTokenBalance, funding.tokenDecimals)}.`);
    error.code = 'INSUFFICIENT_INVESTOR_TOKEN_BALANCE';
    throw error;
  }

  onStep?.({ stage: 'redeem-signature', message: 'Confirm the redemption in the organization wallet.' });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: funding.controller,
    abi: funding.abi,
    functionName: 'redeem',
    args: funding.legacy ? [investor, funding.tokenAddress, funding.tokenAmountRaw] : [investor, funding.tokenAddress, funding.paymentToken, funding.tokenAmountRaw],
  });
  const txHash = await wallet.walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'redeem-submitted', txHash, message: 'Redemption submitted. Waiting for confirmation.' });
  return { txHash, funding };
}

export async function setPlatformTokenPrice({
  controllerAddress,
  paymentTokenAddress,
  connector,
  connectedAddress,
  issuerWalletAddress,
  tokenAddress,
  currentTokenPrice,
  chainId,
  onStep,
}) {
  const normalizedChainId = parseChainId(chainId);
  if (!Number.isSafeInteger(normalizedChainId) || normalizedChainId <= 0) {
    const error = new Error(
      'The token network is missing. Refresh the token configuration before updating its price.',
    );
    error.code = 'TOKEN_PRICE_CHAIN_REQUIRED';
    throw error;
  }
  const chain = chainFor(normalizedChainId);
  const token = requiredAddress(tokenAddress, 'Token contract');
  const issuer = requiredAddress(issuerWalletAddress, 'Organization wallet');
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: issuer,
    chainId: chain.id,
    purpose: 'updating the token price',
  });
  const {
    controller,
    paymentToken,
    paymentTokenDecimals,
    priceDecimals,
    abi,
  } = await priceControllerMetadata(wallet.publicClient, {
    controllerAddress,
    paymentTokenAddress,
    chainId: chain.id,
  });
  const normalizedPrice = normalizeDecimalPrice(currentTokenPrice);
  let priceRaw;
  try {
    priceRaw = parseExactUnits(normalizedPrice, priceDecimals);
  } catch {
    const error = new Error(`The current price supports up to ${priceDecimals} decimal places for this controller.`);
    error.code = 'PRICE_DECIMALS_EXCEEDED';
    throw error;
  }
  if (priceRaw <= 0n) {
    const error = new Error('Current price must be greater than zero.');
    error.code = 'INVALID_PRICE';
    throw error;
  }

  onStep?.({ stage: 'price-signature', message: 'Confirm the current price update in your organization wallet.' });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: controller,
    abi,
    functionName: 'setPrice',
    args: [token, priceRaw],
  });
  const txHash = await wallet.walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'price-confirming', txHash, message: 'Price update submitted. Waiting for confirmation.' });
  let receipt = null;
  let receiptError = null;
  try {
    receipt = await wallet.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: requiredConfirmationsFor(chain.id),
    });
  } catch (cause) {
    receiptError = cause;
  }

  if (receipt && receipt.status !== 'success') {
    const error = new Error('The current price update did not succeed. Your saved price was not changed.');
    error.code = 'PRICE_UPDATE_REVERTED';
    error.transactionHash = txHash;
    error.transactionSubmitted = true;
    error.confirmedRevert = true;
    throw error;
  }

  let confirmedRaw = null;
  if (receipt) {
    try {
      // Read from the exact block that confirmed setPrice whenever the RPC supports
      // it. This avoids a false mismatch when a load-balanced public RPC has one
      // node a block behind immediately after waitForTransactionReceipt resolves.
      if (typeof receipt.blockNumber === 'bigint') {
        confirmedRaw = await readPlatformTokenPriceRaw({
          publicClient: wallet.publicClient,
          controller,
          abi,
          token,
          blockNumber: receipt.blockNumber,
        });
      }
    } catch {
      // Fall through to the propagation-aware latest-state check below.
      confirmedRaw = null;
    }
  }

  if (confirmedRaw !== priceRaw) {
    onStep?.({
      stage: 'price-reconciling',
      txHash,
      message:
        'The network response is taking longer than expected. Checking the live token price automatically.',
    });
    const reconciled = await waitForExpectedPlatformTokenPriceRaw({
      publicClient: wallet.publicClient,
      controller,
      abi,
      token,
      expectedRaw: priceRaw,
      attempts: receipt ? 7 : 9,
    });
    if (reconciled.matched) {
      confirmedRaw = reconciled.priceRaw;
    } else if (receiptError) {
      const error = new Error(
        'The price update was submitted, but confirmation is still pending. We checked the live price automatically; do not submit another price change yet.',
        { cause: reconciled.error || receiptError },
      );
      error.code = 'PRICE_CONFIRMATION_PENDING';
      error.transactionHash = txHash;
      error.transactionSubmitted = true;
      throw error;
    } else {
      const error = new Error(
        'The price transaction was confirmed, but the controller has not reported the configured price after automatic verification. No new transaction was sent.',
        { cause: reconciled.error || undefined },
      );
      error.code = 'PRICE_VERIFICATION_MISMATCH';
      error.transactionHash = txHash;
      error.transactionSubmitted = true;
      error.confirmedPriceRaw = reconciled.priceRaw?.toString?.() || '';
      error.expectedPriceRaw = priceRaw.toString();
      throw error;
    }
  }

  onStep?.({ stage: 'price-confirmed', txHash, message: 'Current price confirmed.' });
  return {
    txHash,
    tokenAddress: token,
    paymentToken,
    paymentTokenDecimals,
    priceRaw,
    currentTokenPrice: formatUnits(priceRaw, priceDecimals),
  };

}

export async function getPlatformTokenPrice({ tokenAddress, chainId = web3Config.requiredChain.id, controllerAddress, paymentTokenAddress }) {
  const publicClient = publicClientFor(chainId);
  const token = requiredAddress(tokenAddress, 'Token contract');
  const metadata = await priceControllerMetadata(publicClient, {
    controllerAddress,
    paymentTokenAddress,
    chainId,
  });
  const rawPrice = await readLatestPlatformTokenPriceRaw({
    publicClient,
    controller: metadata.controller,
    abi: metadata.abi,
    token,
  });
  return {
    ...metadata,
    tokenAddress: token,
    priceRaw: rawPrice,
    currentTokenPrice: formatUnits(rawPrice, metadata.priceDecimals),
  };
}
