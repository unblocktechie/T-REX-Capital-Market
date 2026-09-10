import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  isAddress,
} from 'viem';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

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
  walletErrorCode(error) === 4001 ||
  /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

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

const requiredRawAmount = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('The payment amount returned by the server is invalid. Refresh the page and try again.');
  }
  const amount = BigInt(normalized);
  if (amount <= 0n) {
    throw new Error('The payment amount returned by the server is invalid. Refresh the page and try again.');
  }
  return amount;
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

const activeRegisteredWallet = async ({ connector, connectedAddress, investorWalletAddress, chainId }) => {
  if (!connector?.getProvider) {
    throw new Error('Connect your registered investor wallet before continuing.');
  }
  if (!isAddress(connectedAddress || '')) {
    throw new Error('Connect your registered investor wallet before continuing.');
  }

  const chain = chainFor(chainId);
  const registeredAddress = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  const provider = await connector.getProvider();
  if (!provider?.request) {
    throw new Error('The connected wallet is unavailable. Reconnect it and try again.');
  }

  const accounts = await provider.request({ method: 'eth_accounts' });
  const activeProviderAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(activeProviderAddress || '')) {
    throw new Error('Reconnect your registered investor wallet before continuing.');
  }

  if (getAddress(activeProviderAddress) !== registeredAddress) {
    const error = new Error('Switch to the wallet registered for this investment before continuing.');
    error.code = 'WALLET_MISMATCH';
    throw error;
  }

  if (getAddress(activeProviderAddress) !== getAddress(connectedAddress)) {
    const error = new Error('Your active wallet account changed. Reconnect your registered wallet and try again.');
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
    account: getAddress(activeProviderAddress),
    registeredAddress,
  };
};

/**
 * Broadcast the USDT payment for a backend-created purchase intent.
 *
 * Transaction-critical values are deliberately read only from preparedPurchase.
 * The caller must wait for a successful receipt before sharing the hash with the
 * backend confirm API.
 */
export async function submitInvestorPurchasePayment({
  connector,
  connectedAddress,
  preparedPurchase,
}) {
  const chainId = parseChainId(preparedPurchase?.chainId);
  const usdtContractAddress = requiredAddress(
    preparedPurchase?.usdtContractAddress,
    'Payment token contract',
  );
  const treasuryWalletAddress = requiredAddress(
    preparedPurchase?.treasuryWalletAddress,
    'Issuer treasury wallet',
  );
  const investorWalletAddress = requiredAddress(
    preparedPurchase?.investorWalletAddress,
    'Registered investor wallet',
  );
  const usdtAmountRaw = requiredRawAmount(preparedPurchase?.usdtAmountRaw);

  const { provider, chain, account } = await activeRegisteredWallet({
    connector,
    connectedAddress,
    investorWalletAddress,
    chainId,
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(provider),
  });

  return walletClient.writeContract({
    account,
    chain,
    address: usdtContractAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [treasuryWalletAddress, usdtAmountRaw],
  });
}

/**
 * Wait for the payment transaction to be mined successfully. The frontend uses
 * one confirmed receipt as the gate before it shares the hash with the backend;
 * the backend remains authoritative for its own required confirmation depth.
 */
export async function waitForInvestorPurchasePaymentReceipt({ txHash, chainId, timeout = 180_000 }) {
  const hash = String(txHash || '').trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error('The payment transaction hash is invalid.');
  }

  try {
    const receipt = await publicClientFor(chainId).waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout,
    });

    if (receipt.status !== 'success') {
      const reverted = new Error('The payment transaction was confirmed but did not succeed. No purchase confirmation was sent.');
      reverted.code = 'PAYMENT_REVERTED';
      reverted.transactionHash = hash;
      reverted.transactionSubmitted = true;
      reverted.confirmedRevert = true;
      throw reverted;
    }

    return receipt;
  } catch (error) {
    if (error?.confirmedRevert) throw error;
    const pending = new Error(
      error?.shortMessage
      || error?.message
      || 'The payment is still waiting for network confirmation.',
      { cause: error },
    );
    pending.transactionHash = hash;
    pending.transactionSubmitted = true;
    pending.code = 'PAYMENT_CONFIRMATION_PENDING';
    throw pending;
  }
}

/** Read the registered investor's current deployed-token balance before payment. */
export async function getInvestorPurchaseTokenBalance(preparedPurchase) {
  const tokenAddress = requiredAddress(preparedPurchase?.tokenAddress, 'Token contract');
  const investorWalletAddress = requiredAddress(
    preparedPurchase?.investorWalletAddress,
    'Registered investor wallet',
  );

  return publicClientFor(preparedPurchase?.chainId).readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [investorWalletAddress],
  });
}

/**
 * Ask the connected wallet to track the deployed ERC-3643 token after a first
 * successful purchase. wallet_watchAsset is only called for the registered wallet
 * on the required network and never affects purchase settlement.
 */
export async function addInvestorPurchaseTokenToWallet({
  connector,
  connectedAddress,
  chainId,
  investorWalletAddress,
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
}) {
  const address = requiredAddress(tokenAddress, 'Token contract');
  const symbol = String(tokenSymbol || '').trim();
  const decimals = Number(tokenDecimals);
  if (!symbol) throw new Error('The token symbol is unavailable. Refresh the page and try again.');
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('The token decimals are unavailable. Refresh the page and try again.');
  }

  const { provider } = await activeRegisteredWallet({
    connector,
    connectedAddress,
    investorWalletAddress,
    chainId,
  });

  const added = await provider.request({
    method: 'wallet_watchAsset',
    params: {
      type: 'ERC20',
      options: {
        address,
        symbol,
        decimals,
      },
    },
  });

  return added === true;
}
