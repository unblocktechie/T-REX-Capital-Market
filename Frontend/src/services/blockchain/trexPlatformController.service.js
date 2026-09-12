import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from 'viem';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';

const MAX_UINT256 = (1n << 256n) - 1n;
// The app always grants MAX_UINT256 when the investor explicitly enables USDT
// spending. Some ERC-20 implementations decrement an unlimited allowance while
// others leave MAX_UINT256 untouched, so treat any allowance that is still in
// the upper half of uint256 as the same persistent, one-time approval.
const PERSISTENT_ALLOWANCE_THRESHOLD = MAX_UINT256 >> 1n;

export const TREX_PLATFORM_CONTROLLER_ABI = [
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
];

const clean = (value) => String(value ?? '').trim();

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
  if (!isAddress(normalized)) {
    const error = new Error(`${label} is unavailable. Refresh the page and try again.`);
    error.code = 'INVALID_PLATFORM_ADDRESS';
    throw error;
  }
  return getAddress(normalized);
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

const publicClientFor = (chainId) => {
  const chain = chainFor(chainId);
  return createPublicClient({ chain, transport: http(env.web3.rpcUrl) });
};

export const platformControllerAddress = () => requiredAddress(
  env.trex.platformController,
  'Platform Controller',
);

const configuredPaymentTokenAddress = () => requiredAddress(
  env.trex.paymentToken,
  'Payment token',
);

const activeWallet = async ({ connector, connectedAddress, expectedAddress, chainId, purpose }) => {
  if (!connector?.getProvider || !isAddress(connectedAddress || '')) {
    const error = new Error(`Open your Privy secure account before ${purpose}.`);
    error.code = 'WALLET_NOT_CONNECTED';
    throw error;
  }

  const chain = chainFor(chainId);
  const expected = requiredAddress(expectedAddress, 'Required wallet');
  const connected = getAddress(connectedAddress);
  const provider = await connector.getProvider();
  if (!provider?.request) {
    const error = new Error('Your Privy secure account is unavailable. Sign in with Privy and try again.');
    error.code = 'WALLET_PROVIDER_UNAVAILABLE';
    throw error;
  }

  const accounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(providerAddress || '')) {
    const error = new Error('Restore access to your Privy secure account before continuing.');
    error.code = 'WALLET_NOT_CONNECTED';
    throw error;
  }

  const account = getAddress(providerAddress);
  if (account !== expected) {
    const error = new Error('Use the Privy secure account linked to this T-REX profile before continuing.');
    error.code = 'WALLET_MISMATCH';
    error.expectedAddress = expected;
    throw error;
  }
  if (account !== connected) {
    const error = new Error('Your active Privy secure account changed. Restore the account linked to this T-REX profile and try again.');
    error.code = 'WALLET_ACCOUNT_CHANGED';
    throw error;
  }

  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== chain.id) {
    const error = new Error(`Your Privy secure account needs a quick setup check. Open the account control and try again.`);
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

const controllerPaymentToken = async (publicClient) => {
  const controller = platformControllerAddress();
  const configured = configuredPaymentTokenAddress();
  const onchain = getAddress(await publicClient.readContract({
    address: controller,
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName: 'paymentToken',
  }));

  if (onchain !== configured) {
    const error = new Error('The configured payment token does not match the Platform Controller. Please contact support before continuing.');
    error.code = 'PAYMENT_TOKEN_CONFIGURATION_MISMATCH';
    throw error;
  }
  return onchain;
};

const paymentTokenMetadata = async (publicClient) => {
  const paymentToken = await controllerPaymentToken(publicClient);
  const decimals = Number(await publicClient.readContract({
    address: paymentToken,
    abi: ERC20_PAYMENT_ABI,
    functionName: 'decimals',
  }));
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) {
    const error = new Error('The payment token decimals could not be verified. Please try again.');
    error.code = 'INVALID_PAYMENT_TOKEN_DECIMALS';
    throw error;
  }
  return { paymentToken, paymentTokenDecimals: decimals };
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
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
}) => {
  const controller = platformControllerAddress();
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
      rawAmount = parseUnits(amount, tokenDecimals);
    } catch {
      const error = new Error(`Enter no more than ${tokenDecimals} decimal places for this token.`);
      error.code = 'INVALID_TOKEN_AMOUNT';
      throw error;
    }
  }

  if (rawAmount <= 0n) {
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

const quoteOperation = async ({ mode, chainId, tokenAddress, tokenAmountRaw, tokenAmount }) => {
  const chain = chainFor(chainId);
  const publicClient = publicClientFor(chain.id);
  const controller = platformControllerAddress();
  const tokenInfo = await resolveTokenAmountRaw({
    publicClient,
    tokenAddress,
    tokenAmountRaw,
    tokenAmount,
  });
  const functionName = mode === 'redeem' ? 'quoteRedeem' : 'quoteBuy';
  const quote = await publicClient.readContract({
    address: controller,
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName,
    args: [tokenInfo.token, tokenInfo.rawAmount],
  });
  const [paymentAmountValue, priceValue, quoteTokenDecimalsValue, issuerValue] = quote;
  const paymentAmount = BigInt(paymentAmountValue);
  const price = BigInt(priceValue);
  const quoteTokenDecimals = Number(quoteTokenDecimalsValue);
  const issuer = getAddress(issuerValue);
  const { paymentToken, paymentTokenDecimals } = await paymentTokenMetadata(publicClient);

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
    tokenAddress: tokenInfo.token,
    tokenAmountRaw: tokenInfo.rawAmount,
    tokenDecimals: tokenInfo.tokenDecimals,
    issuer,
    price,
    paymentAmount,
    tokenAmount: formatUnits(tokenInfo.rawAmount, tokenInfo.tokenDecimals),
    priceFormatted: formatUnits(price, paymentTokenDecimals),
    paymentAmountFormatted: formatUnits(paymentAmount, paymentTokenDecimals),
  };
};

export const quotePlatformPurchase = (input) => quoteOperation({ ...input, mode: 'buy' });
export const quotePlatformRedemption = (input) => quoteOperation({ ...input, mode: 'redeem' });

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
 * Read an account's existing USDT approval for the Platform Controller.
 * When a required amount is supplied, any allowance that covers that action is
 * sufficient. Without an amount, only the reusable maximum-style approval is
 * treated as the completed one-time approval state.
 */
export async function getPlatformPaymentApprovalState({
  chainId,
  owner,
  requiredAmountRaw,
}) {
  const chain = chainFor(chainId);
  const publicClient = publicClientFor(chain.id);
  const controller = platformControllerAddress();
  const paymentToken = await controllerPaymentToken(publicClient);
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
  onStep?.({ stage: 'approval-signature', message: 'Allow USDT payments securely with Privy.' });
  const simulation = await publicClient.simulateContract({
    account,
    address: paymentToken,
    abi: ERC20_PAYMENT_ABI,
    functionName: 'approve',
    args: [controller, MAX_UINT256],
  });
  const approvalTxHash = await walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'approval-confirming', txHash: approvalTxHash, message: 'USDT approval submitted. Waiting for confirmation.' });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: approvalTxHash,
    confirmations: 1,
  });
  if (receipt.status !== 'success') {
    const error = new Error('The USDT payment permission was not confirmed. No investment or redemption was submitted.');
    error.code = 'PAYMENT_APPROVAL_REVERTED';
    error.transactionHash = approvalTxHash;
    throw error;
  }
  onStep?.({ stage: 'approval-confirmed', txHash: approvalTxHash, message: 'USDT payment permission confirmed.' });
  return approvalTxHash;
};

/**
 * Complete only the USDT spending-approval step for purchases. This never
 * submits a token purchase. Once MAX_UINT256 has been confirmed on-chain, the
 * UI can enable the independent Purchase action and future purchases can reuse
 * the same approval.
 */
export async function approvePlatformPurchaseSpending({
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  onStep,
}) {
  const investor = requiredAddress(investorWalletAddress, 'Investor Privy secure account');
  const chain = chainFor(chainId);
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: investor,
    chainId: chain.id,
    purpose: 'allowing USDT spending',
  });
  const controller = platformControllerAddress();
  const paymentToken = await controllerPaymentToken(wallet.publicClient);
  const current = await getPlatformPaymentApprovalState({ chainId: chain.id, owner: investor });

  if (current.spendingApproved) {
    return { ...current, approvalTxHash: '', alreadyApproved: true };
  }

  const approvalTxHash = await approveMaximumAllowance({
    ...wallet,
    paymentToken,
    controller,
    onStep,
  });
  const refreshed = await getPlatformPaymentApprovalState({ chainId: chain.id, owner: investor });
  if (!refreshed.spendingApproved) {
    const error = new Error('USDT payment permission was confirmed, but the updated status could not be verified. Refresh and try again.');
    error.code = 'PAYMENT_APPROVAL_NOT_UPDATED';
    error.transactionHash = approvalTxHash;
    throw error;
  }

  return { ...refreshed, approvalTxHash, alreadyApproved: false };
}

export async function submitPlatformPurchase({
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
  const quote = await quotePlatformPurchase({ chainId, tokenAddress, tokenAmountRaw, tokenAmount });
  const investor = requiredAddress(investorWalletAddress, 'Investor Privy secure account');
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: investor,
    chainId: quote.chain.id,
    purpose: 'purchasing tokens',
  });
  const paymentState = await paymentAccountState({ quote, owner: investor });

  if (!paymentState.balanceSufficient) {
    const error = new Error(`Your USDT balance is too low for this purchase. Required: ${quote.paymentAmountFormatted} USDT.`);
    error.code = 'INSUFFICIENT_INVESTOR_BALANCE';
    throw error;
  }

  const expectedRaw = clean(expectedPaymentAmountRaw);
  if (/^\d+$/.test(expectedRaw) && BigInt(expectedRaw) !== quote.paymentAmount) {
    const error = new Error('The token price changed while this purchase was being prepared. Refresh the purchase and confirm the latest amount.');
    error.code = 'PURCHASE_PRICE_CHANGED';
    throw error;
  }

  if (!paymentState.allowanceSufficient) {
    const error = new Error('Allow USDT payments before you make this investment.');
    error.code = 'PAYMENT_APPROVAL_REQUIRED';
    throw error;
  }

  onStep?.({ stage: 'purchase-signature', message: 'Review and confirm your investment securely with Privy.' });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: quote.controller,
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName: 'buy',
    args: [quote.tokenAddress, quote.tokenAmountRaw],
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
      confirmations: 1,
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
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
}) {
  const quote = await quotePlatformRedemption({ chainId, tokenAddress, tokenAmountRaw, tokenAmount });
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
  connector,
  connectedAddress,
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
  onStep,
}) {
  const funding = await getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount });
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

  const approvalTxHash = await approveMaximumAllowance({
    ...wallet,
    paymentToken: funding.paymentToken,
    controller: funding.controller,
    onStep,
  });
  const refreshed = await getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount });
  if (!refreshed.issuerAllowanceSufficient) {
    const error = new Error('The USDT approval was confirmed, but the available allowance could not be verified. Refresh and try again.');
    error.code = 'ISSUER_ALLOWANCE_NOT_UPDATED';
    throw error;
  }
  return { approvalTxHash, funding: refreshed, alreadyApproved: false };
}

export async function submitPlatformRedemption({
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  tokenAddress,
  tokenAmountRaw,
  tokenAmount,
  onStep,
}) {
  const funding = await getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount });
  const investor = requiredAddress(investorWalletAddress, 'Investor Privy secure account');
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: funding.issuer,
    chainId: funding.chain.id,
    purpose: 'executing the redemption',
  });

  if (!funding.issuerAllowanceSufficient) {
    const error = new Error('Allow USDT payments before completing this redemption.');
    error.code = 'ISSUER_ALLOWANCE_REQUIRED';
    throw error;
  }
  if (!funding.issuerBalanceSufficient) {
    const error = new Error(`The organization secure account does not have enough USDT for this redemption. Required: ${funding.paymentAmountFormatted} USDT.`);
    error.code = 'INSUFFICIENT_ISSUER_BALANCE';
    throw error;
  }

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

  onStep?.({ stage: 'redeem-signature', message: 'Review and confirm the redemption securely with Privy.' });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: funding.controller,
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName: 'redeem',
    args: [investor, funding.tokenAddress, funding.tokenAmountRaw],
  });
  const txHash = await wallet.walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'redeem-submitted', txHash, message: 'Redemption submitted. Waiting for confirmation.' });
  return { txHash, funding };
}

export async function setPlatformTokenPrice({
  connector,
  connectedAddress,
  issuerWalletAddress,
  tokenAddress,
  currentTokenPrice,
  chainId = web3Config.requiredChain.id,
  onStep,
}) {
  const chain = chainFor(chainId);
  const token = requiredAddress(tokenAddress, 'Token contract');
  const issuer = requiredAddress(issuerWalletAddress, 'Organization Privy secure account');
  const wallet = await activeWallet({
    connector,
    connectedAddress,
    expectedAddress: issuer,
    chainId: chain.id,
    purpose: 'updating the token price',
  });
  const { paymentToken, paymentTokenDecimals } = await paymentTokenMetadata(wallet.publicClient);
  const normalizedPrice = normalizeDecimalPrice(currentTokenPrice);
  let priceRaw;
  try {
    priceRaw = parseUnits(normalizedPrice, paymentTokenDecimals);
  } catch {
    const error = new Error(`The current price supports up to ${paymentTokenDecimals} decimal places for the configured payment token.`);
    error.code = 'PRICE_DECIMALS_EXCEEDED';
    throw error;
  }
  if (priceRaw <= 0n) {
    const error = new Error('Current price must be greater than zero.');
    error.code = 'INVALID_PRICE';
    throw error;
  }

  onStep?.({ stage: 'price-signature', message: 'Review and confirm the price update securely with Privy.' });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: platformControllerAddress(),
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName: 'setPrice',
    args: [token, priceRaw],
  });
  const txHash = await wallet.walletClient.writeContract(simulation.request);
  onStep?.({ stage: 'price-confirming', txHash, message: 'Price update submitted. Waiting for confirmation.' });
  let receipt;
  try {
    receipt = await wallet.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });
  } catch (cause) {
    const error = new Error(
      'The price update was submitted, but confirmation is still pending. Do not submit another price change yet.',
      { cause },
    );
    error.code = 'PRICE_CONFIRMATION_PENDING';
    error.transactionHash = txHash;
    error.transactionSubmitted = true;
    throw error;
  }
  if (receipt.status !== 'success') {
    const error = new Error('The current price update did not succeed. Your saved price was not changed.');
    error.code = 'PRICE_UPDATE_REVERTED';
    error.transactionHash = txHash;
    error.transactionSubmitted = true;
    error.confirmedRevert = true;
    throw error;
  }

  const confirmedRaw = BigInt(await wallet.publicClient.readContract({
    address: platformControllerAddress(),
    abi: TREX_PLATFORM_CONTROLLER_ABI,
    functionName: 'tokenPrice',
    args: [token],
  }));
  if (confirmedRaw !== priceRaw) {
    const error = new Error('The price update was confirmed, but the latest investment price could not be verified. Refresh before trying again.');
    error.code = 'PRICE_VERIFICATION_MISMATCH';
    error.transactionHash = txHash;
    error.transactionSubmitted = true;
    throw error;
  }

  onStep?.({ stage: 'price-confirmed', txHash, message: 'Current price confirmed.' });
  return {
    txHash,
    tokenAddress: token,
    paymentToken,
    paymentTokenDecimals,
    priceRaw,
    currentTokenPrice: formatUnits(priceRaw, paymentTokenDecimals),
  };
}

export async function getPlatformTokenPrice({ tokenAddress, chainId = web3Config.requiredChain.id }) {
  const publicClient = publicClientFor(chainId);
  const token = requiredAddress(tokenAddress, 'Token contract');
  const [{ paymentToken, paymentTokenDecimals }, rawPrice] = await Promise.all([
    paymentTokenMetadata(publicClient),
    publicClient.readContract({
      address: platformControllerAddress(),
      abi: TREX_PLATFORM_CONTROLLER_ABI,
      functionName: 'tokenPrice',
      args: [token],
    }),
  ]);
  return {
    tokenAddress: token,
    paymentToken,
    paymentTokenDecimals,
    priceRaw: BigInt(rawPrice),
    currentTokenPrice: formatUnits(BigInt(rawPrice), paymentTokenDecimals),
  };
}
