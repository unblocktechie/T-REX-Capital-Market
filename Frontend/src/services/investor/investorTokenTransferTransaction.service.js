import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from 'viem';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';

const ERC3643_TRANSFER_ABI = [
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

const walletErrorCode = (error) =>
  error?.code
  ?? error?.cause?.code
  ?? error?.data?.originalError?.code
  ?? error?.cause?.data?.originalError?.code;

const walletErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isInvestorTokenTransferWalletRejection = (error) =>
  walletErrorCode(error) === 4001
  || /user rejected|user denied|request rejected|rejected the request/.test(walletErrorText(error));

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return Number(value);
};

const chainFor = (value) => {
  const chainId = parseChainId(value);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) throw new Error('This token uses a network that is not available in the application.');
  return chain;
};

const requiredAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) throw new Error(`${label} is unavailable or invalid. Refresh the page and try again.`);
  return getAddress(normalized);
};

async function activeRegisteredWallet({ connector, connectedAddress, investorWalletAddress, chainId }) {
  if (!connector?.getProvider || !isAddress(connectedAddress || '')) {
    throw new Error('Open the Privy secure account linked to your investor profile before continuing.');
  }

  const chain = chainFor(chainId);
  const registeredAddress = requiredAddress(investorWalletAddress, 'Investor Privy secure account');
  const provider = await connector.getProvider();
  if (!provider?.request) throw new Error('The connected wallet is unavailable. Reconnect it and try again.');

  const accounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(providerAddress || '')) throw new Error('Restore the Privy secure account linked to your investor profile before continuing.');

  if (getAddress(providerAddress) !== registeredAddress) {
    const error = new Error('Use the Privy secure account linked to this investment before continuing.');
    error.code = 'WALLET_MISMATCH';
    throw error;
  }
  if (getAddress(providerAddress) !== getAddress(connectedAddress)) {
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

  return {
    chain,
    account: getAddress(providerAddress),
    publicClient: createPublicClient({ chain, transport: http(env.web3.rpcUrl) }),
    walletClient: createWalletClient({ account: getAddress(providerAddress), chain, transport: custom(provider) }),
  };
}

/**
 * Send ERC-3643 tokens directly from the investor wallet. No backend transfer
 * intent, prepared calldata, gas object, or transfer UID is required. The token
 * contract remains the execution authority for compliance and balance checks.
 */
export async function submitInvestorTokenTransfer({
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
  tokenAddress,
  recipientWalletAddress,
  tokenAmountRaw,
  tokenAmount,
  tokenDecimals,
}) {
  const contractAddress = requiredAddress(tokenAddress, 'Token contract');
  const recipientAddress = requiredAddress(recipientWalletAddress, 'Recipient wallet');
  const registeredAddress = requiredAddress(investorWalletAddress, 'Investor Privy secure account');
  if (recipientAddress === registeredAddress) throw new Error('Choose a recipient wallet different from your registered investment wallet.');

  let rawAmount;
  const rawText = String(tokenAmountRaw ?? '').trim();
  if (/^\d+$/.test(rawText) && BigInt(rawText) > 0n) {
    rawAmount = BigInt(rawText);
  } else {
    const decimals = Number(tokenDecimals);
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('The token precision could not be verified. Refresh and try again.');
    try { rawAmount = parseUnits(String(tokenAmount || '').trim(), decimals); } catch { rawAmount = 0n; }
  }
  if (rawAmount <= 0n) throw new Error('Enter an amount greater than zero.');

  const wallet = await activeRegisteredWallet({ connector, connectedAddress, investorWalletAddress: registeredAddress, chainId });
  const simulation = await wallet.publicClient.simulateContract({
    account: wallet.account,
    address: contractAddress,
    abi: ERC3643_TRANSFER_ABI,
    functionName: 'transfer',
    args: [recipientAddress, rawAmount],
  });
  return wallet.walletClient.writeContract(simulation.request);
}
