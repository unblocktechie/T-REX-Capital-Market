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

const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerIdentity',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_userAddress', type: 'address' },
      { name: '_identity', type: 'address' },
      { name: '_country', type: 'uint16' },
    ],
    outputs: [],
  },
];

const walletErrorCode = (error) =>
  error?.code ??
  error?.cause?.code ??
  error?.data?.originalError?.code ??
  error?.cause?.data?.originalError?.code;

const walletErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isIssuerRegistryWalletRejection = (error) =>
  walletErrorCode(error) === 4001 ||
  /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value, 16);
  }
  return Number(value);
};

const publicClients = new Map();

const publicClientFor = (chainIdValue) => {
  const chainId = parseChainId(chainIdValue);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('This investor approval cannot be completed with the current secure account settings.');
  }

  if (!publicClients.has(chain.id)) {
    publicClients.set(
      chain.id,
      createPublicClient({
        chain,
        transport: http(env.web3.rpcUrl),
      }),
    );
  }

  return publicClients.get(chain.id);
};

const isTransactionHash = (value) => /^0x[0-9a-f]{64}$/i.test(String(value || '').trim());

export async function getIssuerRegistryTransactionConfirmationProgress({
  chainId,
  txHash,
  requiredConfirmations = 12,
}) {
  const normalizedHash = String(txHash || '').trim();
  if (!isTransactionHash(normalizedHash)) {
    throw new Error('The confirmation ID is unavailable. Refresh and try again.');
  }

  const required = Number(requiredConfirmations);
  if (!Number.isSafeInteger(required) || required <= 0) {
    throw new Error('The required confirmation count is invalid.');
  }

  const publicClient = publicClientFor(chainId);

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: normalizedHash });
  } catch (error) {
    // A transaction that has not been mined yet has zero confirmations. Keep RPC/network
    // failures retryable so the caller can preserve the last known progress instead.
    if (error?.name === 'TransactionReceiptNotFoundError') {
      return { current: 0, required, percentage: 0, receiptFound: false };
    }
    throw error;
  }

  const latestBlockNumber = await publicClient.getBlockNumber();
  const receiptBlockNumber = receipt?.blockNumber;
  if (typeof receiptBlockNumber !== 'bigint') {
    return { current: 0, required, percentage: 0, receiptFound: false };
  }

  const observedConfirmations = latestBlockNumber >= receiptBlockNumber
    ? latestBlockNumber - receiptBlockNumber + 1n
    : 0n;
  const cappedConfirmations = observedConfirmations > BigInt(required)
    ? BigInt(required)
    : observedConfirmations;
  const current = Number(cappedConfirmations);

  return {
    current,
    required,
    percentage: Math.round((current / required) * 100),
    receiptFound: true,
    receiptStatus: receipt?.status,
    receiptBlockNumber,
    latestBlockNumber,
  };
}

const requiredAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) throw new Error(`${label} is unavailable. Please refresh and try again.`);
  return normalized;
};

const requiredCountry = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('The investor country is unavailable. Please refresh and try again.');
  }

  const country = BigInt(normalized);
  if (country < 0n || country > 65_535n) {
    throw new Error('The investor country is unavailable. Please refresh and try again.');
  }
  return country;
};

export async function submitIssuerRegistryRegistrationTransaction({
  connector,
  connectedAddress,
  organizationWalletAddress,
  preparedRegistration,
}) {
  if (!connector?.getProvider) {
    throw new Error('Open your Privy secure account before approving this investor.');
  }
  if (!isAddress(connectedAddress || '')) {
    throw new Error('Open your Privy secure account before approving this investor.');
  }

  const approvedOrganizationWallet = requiredAddress(
    organizationWalletAddress,
    'Approved organization secure account',
  );
  if (getAddress(connectedAddress) !== getAddress(approvedOrganizationWallet)) {
    const error = new Error('Use the Privy secure account linked to this organization before continuing.');
    error.code = 'ORGANIZATION_WALLET_MISMATCH';
    throw error;
  }

  const chainId = parseChainId(preparedRegistration?.chainId);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('This investor approval cannot be completed with the current secure account settings.');
  }

  // Every transaction-critical value comes from the idempotent preparation endpoint.
  // Never rebuild these values from subscription, token, investor, or browser state.
  const identityRegistryAddress = requiredAddress(
    preparedRegistration?.identityRegistryAddress,
    'Approved investor registry address',
  );
  const investorWalletAddress = requiredAddress(
    preparedRegistration?.investorWalletAddress,
    'Investor Privy wallet address',
  );
  const onchainIdentityAddress = requiredAddress(
    preparedRegistration?.onchainIdentityAddress,
    'Investor technical identity reference',
  );
  const country = requiredCountry(preparedRegistration?.country);

  const provider = await connector.getProvider();
  if (!provider?.request) {
    throw new Error('Your Privy secure account is unavailable. Sign in with Privy and try again.');
  }

  // Do not call eth_requestAccounts here. The issuer explicitly starts the real
  // registry transaction from the CTA after connecting their wallet in the header.
  const accounts = await provider.request({ method: 'eth_accounts' });
  const activeProviderAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(activeProviderAddress || '')) {
    throw new Error('Restore your Privy secure account before approving this investor.');
  }

  if (getAddress(activeProviderAddress) !== getAddress(connectedAddress)) {
    const error = new Error('Your active Privy secure account changed. Restore the organization account linked to T-REX and try again.');
    error.code = 'WALLET_ACCOUNT_CHANGED';
    throw error;
  }
  if (getAddress(activeProviderAddress) !== getAddress(approvedOrganizationWallet)) {
    const error = new Error('The active Privy secure account is not the approved organization account. Restore the correct account before continuing.');
    error.code = 'ORGANIZATION_WALLET_MISMATCH';
    throw error;
  }

  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== chainId) {
    const error = new Error(`Your Privy secure account needs a quick setup check. Open the account control and try again.`);
    error.code = 'WRONG_WALLET_NETWORK';
    error.requiredChainId = chainId;
    throw error;
  }

  const account = getAddress(activeProviderAddress);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(provider),
  });

  // Return the wallet-provided hash exactly as submitted. Privy wallet may internally use
  // delegated execution, so the resulting transaction.to is intentionally not inspected
  // or required to equal the Identity Registry address in the frontend.
  return walletClient.writeContract({
    account,
    chain,
    address: identityRegistryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'registerIdentity',
    args: [investorWalletAddress, onchainIdentityAddress, country],
  });
}
