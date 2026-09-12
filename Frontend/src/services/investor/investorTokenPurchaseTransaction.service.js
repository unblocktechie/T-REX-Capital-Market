import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
} from 'viem';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';
import {
  approvePlatformPurchaseSpending,
  getPlatformPaymentApprovalState,
  isPlatformWalletRejection,
  submitPlatformPurchase,
  waitForPlatformTransactionReceipt,
} from '@/services/blockchain/trexPlatformController.service';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const walletErrorCode = (error) =>
  error?.code ??
  error?.cause?.code ??
  error?.data?.originalError?.code ??
  error?.cause?.data?.originalError?.code;

const walletErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isInvestorPurchaseWalletRejection = (error) =>
  isPlatformWalletRejection(error)
  || walletErrorCode(error) === 4001
  || /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return Number(value);
};

const requiredAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) throw new Error(`${label} is unavailable. Refresh the page and try again.`);
  return getAddress(normalized);
};

const chainFor = (value) => {
  const chainId = parseChainId(value);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('This purchase uses a network that is not available in the application.');
  }
  return chain;
};

const publicClientFor = (chainId) => {
  const chain = chainFor(chainId);
  return createPublicClient({
    chain,
    transport: http(env.web3.rpcUrl),
  });
};

/**
 * Read whether the registered investor already completed the app's persistent
 * USDT spending approval. This is a read-only on-chain check and survives page
 * refreshes because the allowance lives in the USDT contract.
 */
export async function getInvestorUsdtSpendingApproval({
  investorWalletAddress,
  chainId,
  requiredPaymentAmountRaw,
}) {
  return getPlatformPaymentApprovalState({
    owner: investorWalletAddress,
    chainId,
    requiredAmountRaw: requiredPaymentAmountRaw,
  });
}

/**
 * Complete the one-time USDT spending approval only. No purchase is submitted
 * by this function. The Platform Controller receives MAX_UINT256 allowance so
 * later purchases can reuse the same permission without another approval.
 */
export async function approveInvestorUsdtSpending({
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  onStep,
}) {
  return approvePlatformPurchaseSpending({
    connector,
    connectedAddress,
    investorWalletAddress,
    chainId,
    onStep,
  });
}

/**
 * Submit a purchase directly from the registered investor wallet to the
 * Platform Controller. No backend purchase intent is required. USDT spending
 * approval remains a separate wallet transaction.
 */
export async function submitInvestorPurchasePayment({
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
  return submitPlatformPurchase({
    connector,
    connectedAddress,
    investorWalletAddress,
    chainId,
    tokenAddress,
    tokenAmountRaw,
    tokenAmount,
    expectedPaymentAmountRaw,
    onStep,
  });
}

/** Wait for the Platform Controller purchase transaction to confirm. */
export async function waitForInvestorPurchasePaymentReceipt({ txHash, chainId, timeout = 180_000 }) {
  try {
    return await waitForPlatformTransactionReceipt({ txHash, chainId, timeout });
  } catch (error) {
    if (error?.confirmedRevert) {
      error.code = 'PURCHASE_REVERTED';
      throw error;
    }
    error.code = 'PURCHASE_CONFIRMATION_PENDING';
    throw error;
  }
}

/** Read the registered investor's current token balance before purchase. */
export async function getInvestorPurchaseTokenBalance(preparedPurchase) {
  const tokenAddress = requiredAddress(preparedPurchase?.tokenAddress, 'Token contract');
  const investorWalletAddress = requiredAddress(
    preparedPurchase?.investorWalletAddress,
    'Investor Privy secure account',
  );

  return publicClientFor(preparedPurchase?.chainId).readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [investorWalletAddress],
  });
}
