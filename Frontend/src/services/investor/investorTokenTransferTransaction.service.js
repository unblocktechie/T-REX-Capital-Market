import {
  createWalletClient,
  custom,
  getAddress,
  isAddress,
} from 'viem';
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
  if (!chain) {
    throw new Error('This token uses a network that is not available in the application.');
  }
  return chain;
};

const requiredAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) {
    throw new Error(`${label} is unavailable or invalid. Refresh the page and try again.`);
  }
  return getAddress(normalized);
};

async function activeRegisteredWallet({
  connector,
  connectedAddress,
  investorWalletAddress,
  chainId,
}) {
  if (!connector?.getProvider || !isAddress(connectedAddress || '')) {
    throw new Error('Connect your registered investor wallet before continuing.');
  }

  const chain = chainFor(chainId);
  const registeredAddress = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  const provider = await connector.getProvider();

  if (!provider?.request) {
    throw new Error('The connected wallet is unavailable. Reconnect it and try again.');
  }

  const accounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(providerAddress || '')) {
    throw new Error('Reconnect your registered investor wallet before continuing.');
  }

  if (getAddress(providerAddress) !== registeredAddress) {
    const error = new Error('Switch to the wallet registered for this investment before continuing.');
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
    const error = new Error(`Switch your wallet to ${chain.name} and try again.`);
    error.code = 'WRONG_WALLET_NETWORK';
    error.requiredChainId = chain.id;
    throw error;
  }

  return {
    provider,
    chain,
    account: getAddress(providerAddress),
  };
}

/**
 * Broadcast the exact transaction prepared by the transfer-intent API. The
 * frontend deliberately does not rebuild the recipient or raw token amount;
 * those authoritative values come from transactionRequest.
 */
export async function submitInvestorTokenTransfer({
  connector,
  connectedAddress,
  investorWalletAddress,
  transactionRequest,
}) {
  if (!transactionRequest || typeof transactionRequest !== 'object') {
    throw new Error('The prepared transfer is unavailable. Refresh the transfer status and try again.');
  }

  const contractAddress = requiredAddress(transactionRequest.contractAddress, 'Prepared token contract');
  const senderAddress = requiredAddress(transactionRequest.from, 'Prepared sender wallet');
  const functionName = String(transactionRequest.functionName || '').trim();
  const args = Array.isArray(transactionRequest.args) ? transactionRequest.args : [];
  const recipientAddress = requiredAddress(args[0], 'Prepared recipient wallet');
  let rawAmount;
  try {
    rawAmount = BigInt(String(args[1] ?? '').trim());
  } catch {
    throw new Error('The prepared transfer amount is invalid. Refresh the transfer status and try again.');
  }

  if (functionName !== 'transfer' || args.length < 2 || rawAmount <= 0n) {
    throw new Error('The prepared transfer details are invalid. Refresh the transfer status and try again.');
  }

  const preparedChainId = parseChainId(transactionRequest.chainId);
  const registeredAddress = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  if (senderAddress !== registeredAddress) {
    throw new Error('The prepared transfer does not match your registered investment wallet. Refresh the page and try again.');
  }

  const { provider, chain, account } = await activeRegisteredWallet({
    connector,
    connectedAddress,
    investorWalletAddress,
    chainId: preparedChainId,
  });

  if (account !== senderAddress) {
    throw new Error('Switch to the wallet prepared for this transfer before continuing.');
  }
  if (recipientAddress === account) {
    throw new Error('Choose a recipient wallet different from your registered investment wallet.');
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(provider),
  });

  return walletClient.writeContract({
    account,
    chain,
    address: contractAddress,
    abi: ERC3643_TRANSFER_ABI,
    functionName: 'transfer',
    args: [recipientAddress, rawAmount],
  });
}
