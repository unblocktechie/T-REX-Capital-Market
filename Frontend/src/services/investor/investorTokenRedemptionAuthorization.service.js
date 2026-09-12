import { createWalletClient, custom, getAddress, isAddress } from 'viem';
import { web3Config } from '@/config/web3';

const walletErrorCode = (error) =>
  error?.code ??
  error?.cause?.code ??
  error?.data?.originalError?.code ??
  error?.cause?.data?.originalError?.code;

const walletErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isInvestorRedemptionWalletRejection = (error) =>
  walletErrorCode(error) === 4001 ||
  /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return Number(value);
};

const chainFor = (value) => {
  const chainId = parseChainId(value);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('This redemption uses a network that is not available in the application.');
  }
  return chain;
};

const requiredAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) {
    throw new Error(`${label} is unavailable. Refresh the page and try again.`);
  }
  return getAddress(normalized);
};

const requiredTypedData = (preparedRedemption) => {
  const typedData = preparedRedemption?.authorization?.typedData;
  if (!typedData || typeof typedData !== 'object' || Array.isArray(typedData)) {
    throw new Error('The redemption confirmation details are unavailable. Refresh and try again.');
  }

  const { domain, types, message } = typedData;
  if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
    throw new Error('The redemption confirmation details are invalid. Refresh and try again.');
  }
  if (!types || typeof types !== 'object' || Array.isArray(types)) {
    throw new Error('The redemption confirmation details are invalid. Refresh and try again.');
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('The redemption confirmation details are invalid. Refresh and try again.');
  }

  const candidatePrimaryTypes = Object.keys(types).filter((key) => key !== 'EIP712Domain');
  const primaryType = String(typedData.primaryType || '').trim() ||
    (candidatePrimaryTypes.length === 1 ? candidatePrimaryTypes[0] : '');
  if (!primaryType || !Object.prototype.hasOwnProperty.call(types, primaryType)) {
    throw new Error('The redemption confirmation details are incomplete. Refresh and try again.');
  }

  return { typedData, domain, types, message, primaryType };
};

/**
 * Sign only the EIP-712 authorization prepared by the redemption backend.
 * Domain, types, and message are passed through unchanged. The frontend never
 * reconstructs token/payment amounts and never submits a token transaction.
 */
export async function signInvestorTokenRedemptionAuthorization({
  connector,
  connectedAddress,
  registeredWalletAddress,
  chainId,
  preparedRedemption,
}) {
  if (!connector?.getProvider) {
    throw new Error('Open the Privy secure account linked to your investor profile before continuing.');
  }

  const registeredAddress = requiredAddress(registeredWalletAddress, 'Investor Privy secure account');
  const connected = requiredAddress(connectedAddress, 'Privy secure account');
  const chain = chainFor(chainId);
  const { domain, types, message, primaryType } = requiredTypedData(preparedRedemption);

  const provider = await connector.getProvider();
  if (!provider?.request) {
    throw new Error('The connected wallet is unavailable. Reconnect it and try again.');
  }

  const accounts = await provider.request({ method: 'eth_accounts' });
  const activeProviderAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(activeProviderAddress || '')) {
    throw new Error('Restore the Privy secure account linked to your investor profile before continuing.');
  }

  const activeAddress = getAddress(activeProviderAddress);
  if (activeAddress !== registeredAddress) {
    const error = new Error('Use the Privy secure account linked to this investment before continuing.');
    error.code = 'WALLET_MISMATCH';
    throw error;
  }
  if (activeAddress !== connected) {
    const error = new Error('Your active wallet account changed. Reconnect your registered wallet and try again.');
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

  const walletClient = createWalletClient({
    account: activeAddress,
    chain,
    transport: custom(provider),
  });

  return walletClient.signTypedData({
    account: activeAddress,
    domain,
    types,
    primaryType,
    message,
  });
}
