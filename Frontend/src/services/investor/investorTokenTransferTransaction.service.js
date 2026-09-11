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

const supportedTokenDecimals = (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 36) {
    throw new Error('Token decimal configuration is unavailable. Refresh the page and try again.');
  }
  return parsed;
};

const requiredTransferAmount = (value, decimals) => {
  const normalized = String(value || '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !/[1-9]/.test(normalized)) {
    throw new Error('Enter a token amount greater than zero.');
  }

  try {
    const rawAmount = parseUnits(normalized, decimals);
    if (rawAmount <= 0n) throw new Error('Enter a token amount greater than zero.');
    return rawAmount;
  } catch (error) {
    if (error?.message === 'Enter a token amount greater than zero.') throw error;
    throw new Error(`Enter an amount with no more than ${decimals} decimal place${decimals === 1 ? '' : 's'}.`);
  }
};

const publicClientFor = (chainId) => {
  const chain = chainFor(chainId);
  return createPublicClient({
    chain,
    transport: http(env.web3.rpcUrl),
  });
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
 * Send an investor-to-investor ERC-3643 token transfer directly from the
 * connected registered investor wallet. No backend approval or write API is
 * involved: the token contract is the authority for transfer compliance.
 */
export async function submitInvestorTokenTransfer({
  connector,
  connectedAddress,
  investorWalletAddress,
  tokenAddress,
  recipient,
  amount,
  tokenDecimals,
  chainId,
}) {
  const contractAddress = requiredAddress(tokenAddress, 'Token contract');
  const recipientAddress = requiredAddress(recipient, 'Recipient wallet');
  const decimals = supportedTokenDecimals(tokenDecimals);
  const rawAmount = requiredTransferAmount(amount, decimals);

  const { provider, chain, account } = await activeRegisteredWallet({
    connector,
    connectedAddress,
    investorWalletAddress,
    chainId,
  });

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

/**
 * Wait for the submitted transfer to be mined successfully. A transaction hash
 * is never treated as completion by itself. Unknown RPC/timeout failures keep
 * the transaction in a submitted/confirming state so the UI does not fabricate
 * either success or failure.
 */
export async function waitForInvestorTokenTransferReceipt({
  txHash,
  chainId,
  timeout = 30_000,
}) {
  const hash = String(txHash || '').trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error('The transfer transaction hash is invalid.');
  }

  try {
    const receipt = await publicClientFor(chainId).waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout,
    });

    if (receipt.status !== 'success') {
      const reverted = new Error('The transfer was confirmed by the network but did not succeed. No tokens were transferred.');
      reverted.code = 'TRANSFER_REVERTED';
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
      || 'The transfer is still waiting for network confirmation.',
      { cause: error },
    );
    pending.code = 'TRANSFER_CONFIRMATION_PENDING';
    pending.transactionHash = hash;
    pending.transactionSubmitted = true;
    throw pending;
  }
}
