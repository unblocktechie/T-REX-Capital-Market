import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  isAddress,
  parseUnits,
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

const firstWalletErrorMessage = (error) =>
  String(error?.shortMessage || error?.details || error?.message || '').trim();

const looksLikeTechnicalWalletError = (message) =>
  /contract function|contract call:|function:\s*transfer|args:|sender:|docs:\s*https?:|viem@|execution reverted|simulatecontract|contractfunctionrevertederror|rpc request|eth_estimateGas|eth_sendTransaction|request arguments/i.test(
    message,
  );

/**
 * Convert wallet / viem transfer failures into concise copy suitable for the
 * investor UI. Raw contract simulation output can contain addresses, calldata,
 * library versions and documentation URLs; none of that helps an investor
 * decide what to do next.
 */
export const getInvestorTokenTransferErrorMessage = (error) => {
  const code = walletErrorCode(error);
  const text = walletErrorText(error);
  const originalMessage = firstWalletErrorMessage(error);

  if (
    code === -32002
    || /already pending|request of type.*already pending|wallet request.*pending/.test(text)
  ) {
    return 'A wallet request is already open. Complete or close it in MetaMask, then try again.';
  }

  if (/insufficient funds.*gas|insufficient funds for intrinsic transaction cost/.test(text)) {
    return 'Your registered wallet needs enough native currency on the selected network to pay the network fee.';
  }

  if (/transfer not possible|transfer is not possible/.test(text)) {
    return 'This transfer is not allowed by the token’s current transfer rules. Check that the recipient is approved and eligible to receive this asset, then try again. No tokens were sent.';
  }

  if (/recipient.*(?:not verified|not eligible|not registered)|identity.*(?:not verified|not registered)/.test(text)) {
    return 'The recipient is not currently approved to receive this asset. Ask them to complete the required verification, then try again.';
  }

  if (/token.*paused|transfer.*paused|pausable: paused|contract is paused/.test(text)) {
    return 'Transfers for this asset are temporarily paused. Try again after the issuer enables transfers.';
  }

  if (/address.*frozen|wallet.*frozen|tokens?.*frozen|account.*frozen/.test(text)) {
    return 'This transfer cannot be completed because one of the accounts or token units is currently restricted. Contact the issuer if you believe this is unexpected.';
  }

  if (/insufficient balance|transfer amount exceeds balance|exceeds.*balance/.test(text)) {
    return 'You do not have enough available token units for this transfer. Reduce the amount and try again.';
  }

  if (/nonce too low|already known transaction|replacement transaction underpriced/.test(text)) {
    return 'Your wallet is still processing a recent transaction. Wait a moment, then try again.';
  }

  if (/network|rpc|transport|failed to fetch|disconnected|timeout/.test(text)) {
    return 'Your wallet temporarily lost its network connection. No tokens were sent. Please try again.';
  }

  // Preserve application-authored errors (wrong wallet, wrong network, invalid
  // recipient, etc.) because those are already concise and actionable.
  if (originalMessage && !looksLikeTechnicalWalletError(originalMessage)) {
    return originalMessage;
  }

  return 'This transfer could not be prepared by your wallet. Check the recipient and amount, then try again. No tokens were sent.';
};

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
    throw new Error('Connect your registered investor wallet before continuing.');
  }

  const chain = chainFor(chainId);
  const registeredAddress = requiredAddress(investorWalletAddress, 'Registered investor wallet');
  const provider = await connector.getProvider();
  if (!provider?.request) throw new Error('The connected wallet is unavailable. Reconnect it and try again.');

  const accounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(providerAddress || '')) throw new Error('Reconnect your registered investor wallet before continuing.');

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
    chain,
    account: getAddress(providerAddress),
    publicClient: createPublicClient({ chain, transport: http(web3Config.getChainRecordById(chain.id)?.publicRpcUrl) }),
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
  const registeredAddress = requiredAddress(investorWalletAddress, 'Registered investor wallet');
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
