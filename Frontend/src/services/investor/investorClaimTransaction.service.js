import {
  createWalletClient,
  custom,
  getAddress,
  isAddress,
  isHex,
} from 'viem';
import { web3Config } from '@/config/web3';

const IDENTITY_ADD_CLAIM_ABI = [
  {
    type: 'function',
    name: 'addClaim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_topic', type: 'uint256' },
      { name: '_scheme', type: 'uint256' },
      { name: '_issuer', type: 'address' },
      { name: '_signature', type: 'bytes' },
      { name: '_data', type: 'bytes' },
      { name: '_uri', type: 'string' },
    ],
    outputs: [{ name: 'claimRequestId', type: 'bytes32' }],
  },
];

const walletErrorCode = (error) =>
  error?.code ??
  error?.cause?.code ??
  error?.data?.originalError?.code ??
  error?.cause?.data?.originalError?.code;

const walletErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isInvestorClaimWalletRejection = (error) =>
  walletErrorCode(error) === 4001 ||
  /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return Number(value);
};

const requiredInteger = (value, label) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} was not returned in a valid format.`);
  return BigInt(normalized);
};

const requiredHex = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isHex(normalized)) throw new Error(`${label} was not returned in a valid format.`);
  return normalized;
};

export async function submitInvestorClaimTransaction({
  connector,
  connectedAddress,
  registeredWalletAddress,
  preparedClaim,
}) {
  const investorIdentityAddress = preparedClaim?.investorIdentityAddress;
  const issuerIdentityAddress = preparedClaim?.issuerIdentityAddress;

  if (!connector?.getProvider) throw new Error('Reconnect your investor wallet before submitting this claim.');
  if (!isAddress(connectedAddress || '')) throw new Error('Connect a valid investor wallet before submitting this claim.');
  if (!isAddress(investorIdentityAddress || '')) throw new Error('The investor ONCHAINID returned by claim preparation is invalid.');
  if (!isAddress(issuerIdentityAddress || '')) throw new Error('The issuer ONCHAINID returned by claim preparation is invalid.');

  // Parse and validate the backend-prepared transaction values before interacting
  // with the wallet provider. If the prepare response is malformed, MetaMask should
  // never be asked to create a transaction.
  const claimTopic = requiredInteger(preparedClaim?.claimTopic, 'Claim topic');
  const scheme = requiredInteger(preparedClaim?.scheme ?? preparedClaim?.claimScheme ?? 1, 'Claim scheme');
  const signature = requiredHex(preparedClaim?.signature, 'Claim signature');
  const data = requiredHex(preparedClaim?.data, 'Claim data');
  const uri = typeof preparedClaim?.uri === 'string' ? preparedClaim.uri : '';

  const provider = await connector.getProvider();
  if (!provider?.request) throw new Error('The connected wallet provider is unavailable. Reconnect your wallet and try again.');

  // Re-check the active wallet account directly against the provider immediately before
  // opening the contract transaction. This closes the small gap where an account can be
  // changed in the wallet after React rendered the last wagmi connection state.
  const providerAccounts = await provider.request({ method: 'eth_accounts' });
  const activeProviderAddress = Array.isArray(providerAccounts) ? providerAccounts[0] : '';
  if (!isAddress(activeProviderAddress || '')) {
    throw new Error('Reconnect your investor wallet before submitting this claim.');
  }

  if (
    registeredWalletAddress &&
    isAddress(registeredWalletAddress) &&
    getAddress(activeProviderAddress) !== getAddress(registeredWalletAddress)
  ) {
    const error = new Error(
      'The connected wallet does not match your registered wallet. Please switch to your registered wallet and try again.',
    );
    error.code = 'WALLET_MISMATCH';
    throw error;
  }

  if (getAddress(activeProviderAddress) !== getAddress(connectedAddress)) {
    const error = new Error(
      registeredWalletAddress
        ? 'The connected wallet does not match your registered wallet. Please switch to your registered wallet and try again.'
        : 'Your active wallet account changed. Reconnect the investor wallet and try again.',
    );
    error.code = registeredWalletAddress ? 'WALLET_MISMATCH' : 'WALLET_ACCOUNT_CHANGED';
    throw error;
  }

  // Re-check the chain directly against the provider immediately before opening the
  // wallet request. This protects against the user changing networks between renders.
  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== web3Config.requiredChain.id) {
    const error = new Error('Please switch your wallet to the required network to submit this claim.');
    error.code = 'WRONG_WALLET_NETWORK';
    throw error;
  }

  const account = getAddress(connectedAddress);
  const walletClient = createWalletClient({
    account,
    chain: web3Config.requiredChain,
    transport: custom(provider),
  });

  // Transaction-critical claim values come from POST /investor/claims/:claimId/prepare.
  // Do not derive or reuse potentially stale topic/identity/data/signature values from
  // catalogue metadata or the previously rendered claim list.
  return walletClient.writeContract({
    account,
    chain: web3Config.requiredChain,
    address: getAddress(investorIdentityAddress),
    abi: IDENTITY_ADD_CLAIM_ABI,
    functionName: 'addClaim',
    args: [
      claimTopic,
      scheme,
      getAddress(issuerIdentityAddress),
      signature,
      data,
      uri,
    ],
  });
}
