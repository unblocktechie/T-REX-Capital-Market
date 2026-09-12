import {
  encodeFunctionData,
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

export const getInvestorClaimWalletErrorMessage = (error) => {
  const code = walletErrorCode(error);
  const text = walletErrorText(error);

  if (
    code === -32002 ||
    /already pending|request of type.*already pending|wallet request.*pending/.test(text)
  ) {
    return 'A Privy wallet request is already open. Complete or close it, then try again.';
  }

  if (/insufficient funds|insufficient balance/.test(text)) {
    return 'Your registered wallet needs a small amount of Sepolia ETH to pay the network fee.';
  }

  if (
    /eth_sendrawtransaction/.test(text) &&
    /method not found|method not supported|custom/.test(text)
  ) {
    return 'Your wallet network connection could not send the approval. No changes were made. Please try again.';
  }

  if (/nonce too low|already known transaction|replacement transaction underpriced/.test(text)) {
    return 'Your wallet is still processing a recent transaction. Wait a moment, then check the verification status again.';
  }

  if (/execution reverted|contract function.*reverted|reverted with/.test(text)) {
    return 'The verification approval could not be completed on the network. Refresh the page and try again.';
  }

  if (/network|rpc|transport|failed to fetch|disconnected/.test(text)) {
    return 'Your wallet temporarily lost its network connection. No changes were made. Please try again.';
  }

  return 'We could not send the verification approval through your wallet. No changes were made. Please try again.';
};

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

const validTransactionHash = (value) => /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());

export async function submitInvestorClaimTransaction({
  connector,
  connectedAddress,
  registeredWalletAddress,
  preparedClaim,
}) {
  const investorIdentityAddress = preparedClaim?.investorIdentityAddress;
  const issuerIdentityAddress = preparedClaim?.issuerIdentityAddress;

  if (!connector?.getProvider) throw new Error('Reconnect your investor wallet before submitting this claim.');
  if (!isAddress(connectedAddress || '')) throw new Error('Open the Privy secure account linked to your investor profile before submitting this verification.');
  if (!isAddress(investorIdentityAddress || '')) throw new Error('The investor ONCHAINID returned by claim preparation is invalid.');
  if (!isAddress(issuerIdentityAddress || '')) throw new Error('The issuer ONCHAINID returned by claim preparation is invalid.');

  // Parse and validate the backend-prepared transaction values before interacting
  // with the wallet provider. If the prepare response is malformed, the Privy wallet should
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

  const account = getAddress(activeProviderAddress);
  const identityAddress = getAddress(investorIdentityAddress);
  const transactionData = encodeFunctionData({
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

  // Use the injected wallet's EIP-1193 eth_sendTransaction method directly.
  // This keeps signing and broadcasting inside the Privy wallet and avoids the intermittent
  // custom-provider path that was surfacing an eth_sendRawTransaction "Method not found"
  // error on the first attempt for some accounts. No raw signed transaction is created
  // or sent by the application.
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: account,
        to: identityAddress,
        data: transactionData,
        value: '0x0',
      },
    ],
  });

  if (!validTransactionHash(txHash)) {
    const error = new Error('Your wallet did not return a valid transaction ID. Please check the Privy wallet prompt and try again.');
    error.code = 'INVALID_WALLET_TRANSACTION_HASH';
    throw error;
  }

  return txHash;
}
