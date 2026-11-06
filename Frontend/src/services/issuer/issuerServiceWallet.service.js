import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  isAddress,
  zeroAddress,
} from 'viem';
import { web3Config } from '@/config/web3';
import platformControllerAbi from '@/abi/TREXPlatformController.json';

const clean = (value) => String(value || '').trim();

const parseChainId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value, 16);
  }
  return Number(value);
};

const requiredAddress = (value, label) => {
  const normalized = clean(value);
  if (!isAddress(normalized, { strict: false })) {
    const error = new Error(`${label} is unavailable or invalid.`);
    error.code = 'INVALID_ADDRESS';
    throw error;
  }
  return getAddress(normalized.toLowerCase());
};

const getProvider = async (connector) => {
  const provider = await connector?.getProvider?.();
  if (!provider?.request) {
    const error = new Error('Reconnect your organization wallet and try again.');
    error.code = 'WALLET_PROVIDER_UNAVAILABLE';
    throw error;
  }
  return provider;
};

export const normalizeServiceWalletAddress = (value) => {
  const normalized = clean(value);
  if (!normalized) return '';
  return requiredAddress(normalized, 'Service Wallet address');
};

export const SERVICE_WALLET_ZERO_ADDRESS = zeroAddress;

export const isZeroServiceWallet = (value) => {
  try {
    return normalizeServiceWalletAddress(value) === getAddress(zeroAddress);
  } catch {
    return false;
  }
};

/**
 * Register or rotate the issuer Service Wallet on the selected chain.
 * The organization main wallet is the only browser wallet allowed to submit
 * this transaction. The Service Wallet private key never enters the browser.
 */
export async function registerIssuerServiceWallet({
  connector,
  connectedAddress,
  issuerWalletAddress,
  serviceWalletAddress,
  tokenAddress,
  chainId,
  platformControllerAddress,
  confirmations = 1,
}) {
  const requestedChainId = parseChainId(chainId);
  const chain = web3Config.getChainById(requestedChainId);
  if (!chain) {
    const error = new Error('The selected network is not configured in this application.');
    error.code = 'UNSUPPORTED_CHAIN';
    throw error;
  }

  const expectedIssuer = requiredAddress(issuerWalletAddress, 'Organization wallet');
  const expectedConnected = requiredAddress(connectedAddress, 'Connected wallet');
  const serviceWallet = requiredAddress(serviceWalletAddress, 'Service Wallet address');
  const controller = requiredAddress(platformControllerAddress, 'Token Platform Controller');
  const token = requiredAddress(tokenAddress, 'Deployed token');

  if (expectedConnected !== expectedIssuer) {
    const error = new Error('Connect the approved organization wallet before changing the Service Wallet.');
    error.code = 'WALLET_MISMATCH';
    error.expectedAddress = expectedIssuer;
    throw error;
  }

  const provider = await getProvider(connector);
  const providerAccounts = await provider.request({ method: 'eth_accounts' });
  const providerAddress = Array.isArray(providerAccounts) ? providerAccounts[0] : '';
  if (!isAddress(providerAddress || '', { strict: false })) {
    const error = new Error('Reconnect the approved organization wallet before continuing.');
    error.code = 'WALLET_NOT_CONNECTED';
    throw error;
  }

  const providerAccount = getAddress(String(providerAddress).toLowerCase());
  if (providerAccount !== expectedIssuer || providerAccount !== expectedConnected) {
    const error = new Error('The active MetaMask account is not the approved organization wallet.');
    error.code = 'WALLET_MISMATCH';
    error.expectedAddress = expectedIssuer;
    throw error;
  }

  const providerChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (providerChainId !== chain.id) {
    const error = new Error(`Switch MetaMask to ${chain.name} before changing the Service Wallet.`);
    error.code = 'SELECTED_CHAIN_MISMATCH';
    error.requiredChainId = chain.id;
    throw error;
  }

  const rpcUrl = web3Config.getChainRecordById(chain.id)?.publicRpcUrl;
  if (!rpcUrl) {
    const error = new Error('The selected network RPC configuration is unavailable.');
    error.code = 'UNSUPPORTED_CHAIN';
    throw error;
  }

  const walletClient = createWalletClient({
    account: providerAccount,
    chain,
    transport: custom(provider),
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const simulation = await publicClient.simulateContract({
    account: providerAccount,
    address: controller,
    abi: platformControllerAbi,
    functionName: 'setServiceWallet',
    // Uploaded ABI: setServiceWallet(address serviceWallet, address token).
    args: [serviceWallet, token],
  });
  const txHash = await walletClient.writeContract(simulation.request);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: Math.max(1, Number(confirmations) || 1),
    timeout: 180_000,
  });

  if (receipt.status !== 'success') {
    const error = new Error('The Service Wallet transaction did not complete successfully.');
    error.code = 'SERVICE_WALLET_TRANSACTION_FAILED';
    throw error;
  }

  // The caller must not synchronize the backend until this receipt succeeds.
  // Returning only after confirmation guarantees the browser flow is ordered as
  // MetaMask -> confirmed setServiceWallet transaction -> backend PUT.
  return { txHash, receipt, serviceWalletAddress: serviceWallet, tokenAddress: token };
}

/**
 * Revoke the issuer Service Wallet on the selected chain.
 * This is the same controller action as registration, with the zero address.
 * The caller still must synchronize the zero address to the backend only after
 * the on-chain receipt succeeds.
 */
export async function revokeIssuerServiceWallet(options) {
  return registerIssuerServiceWallet({
    ...options,
    serviceWalletAddress: SERVICE_WALLET_ZERO_ADDRESS,
  });
}


/** Read only the selected token's on-chain registration (never the issuer wallet). */
export async function readTokenServiceWallet({ tokenAddress, chainId, platformControllerAddress }) {
  const token = requiredAddress(tokenAddress, 'Deployed token');
  const controller = requiredAddress(platformControllerAddress, 'Token Platform Controller');
  const chain = web3Config.getChainById(parseChainId(chainId));
  const rpcUrl = web3Config.getChainRecordById(chain?.id)?.publicRpcUrl;
  if (!chain || !rpcUrl) throw new Error('The token network is not configured for verification.');
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = await client.readContract({
    address: controller, abi: platformControllerAbi,
    functionName: 'serviceWalletOf', args: [token],
  });
  return isZeroServiceWallet(wallet) ? '' : normalizeServiceWalletAddress(wallet);
}
