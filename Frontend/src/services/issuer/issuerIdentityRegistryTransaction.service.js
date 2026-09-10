import {
  createWalletClient,
  custom,
  getAddress,
  isAddress,
} from 'viem';
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
  preparedRegistration,
}) {
  if (!connector?.getProvider) {
    throw new Error('Connect your issuer wallet before adding this investor to the registry.');
  }
  if (!isAddress(connectedAddress || '')) {
    throw new Error('Connect your issuer wallet before adding this investor to the registry.');
  }

  const chainId = parseChainId(preparedRegistration?.chainId);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('This registration uses a network that is not available in the application.');
  }

  // Every transaction-critical value comes from the idempotent preparation endpoint.
  // Never rebuild these values from subscription, token, investor, or browser state.
  const identityRegistryAddress = requiredAddress(
    preparedRegistration?.identityRegistryAddress,
    'Identity Registry address',
  );
  const investorWalletAddress = requiredAddress(
    preparedRegistration?.investorWalletAddress,
    'Investor wallet address',
  );
  const onchainIdentityAddress = requiredAddress(
    preparedRegistration?.onchainIdentityAddress,
    'Investor identity address',
  );
  const country = requiredCountry(preparedRegistration?.country);

  const provider = await connector.getProvider();
  if (!provider?.request) {
    throw new Error('The connected wallet is unavailable. Reconnect it and try again.');
  }

  // Do not call eth_requestAccounts here. The issuer explicitly starts the real
  // registry transaction from the CTA after connecting their wallet in the header.
  const accounts = await provider.request({ method: 'eth_accounts' });
  const activeProviderAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(activeProviderAddress || '')) {
    throw new Error('Reconnect your issuer wallet before adding this investor to the registry.');
  }

  if (getAddress(activeProviderAddress) !== getAddress(connectedAddress)) {
    const error = new Error('Your active wallet account changed. Reconnect your issuer wallet and try again.');
    error.code = 'WALLET_ACCOUNT_CHANGED';
    throw error;
  }

  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== chainId) {
    const error = new Error(`Switch your wallet to ${chain.name} and try again.`);
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

  return walletClient.writeContract({
    account,
    chain,
    address: identityRegistryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'registerIdentity',
    args: [investorWalletAddress, onchainIdentityAddress, country],
  });
}
