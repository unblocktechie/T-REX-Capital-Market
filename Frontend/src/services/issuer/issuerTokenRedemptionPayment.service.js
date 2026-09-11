import { createWalletClient, custom, getAddress, isAddress } from 'viem';
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

const errorCode = (error) =>
  error?.code ?? error?.cause?.code ?? error?.data?.originalError?.code ?? error?.cause?.data?.originalError?.code;

const errorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

export const isIssuerRedemptionWalletRejection = (error) =>
  errorCode(error) === 4001 || /user rejected|user denied|request rejected|rejected the request/.test(errorText(error));

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return Number(value);
};

const requiredAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) throw new Error(`${label} is unavailable. Refresh the redemption and try again.`);
  return getAddress(normalized);
};

const requiredRawAmount = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized) || BigInt(normalized) <= 0n) {
    throw new Error('The authoritative USDT payment amount is unavailable. Refresh and try again.');
  }
  return BigInt(normalized);
};

/**
 * Sends the issuer payment using only transaction-critical values returned by the redemption backend.
 * Never derive the recipient, amount, contract, or network from token/browser state.
 */
export async function submitIssuerRedemptionPayment({ connector, connectedAddress, redemption }) {
  if (!connector?.getProvider || !isAddress(connectedAddress || '')) {
    throw new Error('Connect the payment wallet before sending the redemption payment.');
  }

  const chainId = parseChainId(redemption?.chainId);
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);
  if (!chain) throw new Error('This redemption uses a network that is not configured in the application.');

  const expectedIssuerWallet = requiredAddress(
    redemption?.issuerPaymentWalletAddress,
    'Issuer payment wallet',
  );
  const usdtContractAddress = requiredAddress(redemption?.usdtContractAddress, 'Payment details');
  const investorWalletAddress = requiredAddress(redemption?.investorWalletAddress, 'Investor payment details');
  const usdtAmountRaw = requiredRawAmount(redemption?.usdtAmountRaw);

  const provider = await connector.getProvider();
  if (!provider?.request) throw new Error('The connected wallet is unavailable. Reconnect it and try again.');

  const accounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(accounts) ? accounts[0] : '';
  if (!isAddress(providerAddress || '')) {
    throw new Error('Reconnect your issuer payment wallet before continuing.');
  }

  if (getAddress(providerAddress) !== getAddress(connectedAddress)) {
    const error = new Error('Your active wallet account changed. Reconnect your issuer payment wallet and try again.');
    error.code = 'WALLET_ACCOUNT_CHANGED';
    throw error;
  }
  if (getAddress(providerAddress) !== expectedIssuerWallet) {
    const error = new Error('Switch to the payment wallet assigned to this redemption.');
    error.code = 'WRONG_ISSUER_PAYMENT_WALLET';
    error.expectedAddress = expectedIssuerWallet;
    throw error;
  }

  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== chainId) {
    const error = new Error(`Switch your wallet to ${chain.name} before sending the issuer payment.`);
    error.code = 'WRONG_WALLET_NETWORK';
    error.requiredChainId = chainId;
    throw error;
  }

  const account = getAddress(providerAddress);
  const walletClient = createWalletClient({ account, chain, transport: custom(provider) });

  return walletClient.writeContract({
    account,
    chain,
    address: usdtContractAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [investorWalletAddress, usdtAmountRaw],
  });
}
