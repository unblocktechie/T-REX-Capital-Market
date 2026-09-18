import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
];

const clients = new Map();

const normalizeAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) throw new Error(`${label} is unavailable.`);
  return getAddress(normalized);
};

const readableChains = () => {
  const unique = new Map();
  [...(web3Config.supportedChains || []), ...(web3Config.walletViewChains || [])].forEach((chain) => {
    if (chain?.id) unique.set(chain.id, chain);
  });
  return [...unique.values()];
};

const publicClientFor = (chainId) => {
  const resolvedChainId = Number(chainId || web3Config.requiredChain.id);
  const chain = readableChains().find((item) => item.id === resolvedChainId);
  if (!chain) throw new Error('This wallet network is not supported by the application.');

  if (!clients.has(chain.id)) {
    const rpcUrl = chain.id === web3Config.requiredChain.id
      ? env.web3.rpcUrl
      : chain.rpcUrls?.default?.http?.[0];

    clients.set(
      chain.id,
      createPublicClient({
        chain,
        transport: http(rpcUrl),
      }),
    );
  }
  return clients.get(chain.id);
};

const safeDecimals = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : null;
};

export async function readWalletNativeBalance({ walletAddress, chainId }) {
  const account = normalizeAddress(walletAddress, 'Wallet address');
  const resolvedChainId = Number(chainId || web3Config.requiredChain.id);
  const chain = readableChains().find((item) => item.id === resolvedChainId);
  if (!chain) throw new Error('This wallet network is not supported by the application.');

  const client = publicClientFor(resolvedChainId);
  const rawBalance = await client.getBalance({ address: account });
  const decimals = safeDecimals(chain.nativeCurrency?.decimals) ?? 18;

  return {
    rawBalance,
    decimals,
    symbol: chain.nativeCurrency?.symbol || '',
    formatted: formatUnits(rawBalance, decimals),
    chainId: chain.id,
    chainName: chain.name,
  };
}

export async function readWalletTokenBalance({ tokenAddress, walletAddress, chainId, decimals }) {
  const address = normalizeAddress(tokenAddress, 'Token contract');
  const account = normalizeAddress(walletAddress, 'Wallet address');
  const client = publicClientFor(chainId);
  const metadataDecimals = safeDecimals(decimals);
  let resolvedDecimals = metadataDecimals;

  // The token contract is authoritative for decimals. Portfolio/application
  // metadata can be stale or omitted, which would otherwise expose raw base
  // units (for example 12,500,000,000 instead of 125 for an 8-decimal token).
  // Keep metadata only as a defensive fallback for unusual ERC-20 contracts
  // whose decimals() read is unavailable.
  try {
    const onchainDecimals = safeDecimals(
      Number(
        await client.readContract({
          address,
          abi: ERC20_BALANCE_ABI,
          functionName: 'decimals',
        }),
      ),
    );
    if (onchainDecimals !== null) resolvedDecimals = onchainDecimals;
  } catch (error) {
    if (resolvedDecimals === null) throw error;
  }

  if (resolvedDecimals === null) {
    throw new Error('Token decimals are unavailable.');
  }

  const rawBalance = await client.readContract({
    address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [account],
  });

  return {
    rawBalance,
    decimals: resolvedDecimals,
    formatted: formatUnits(rawBalance, resolvedDecimals),
  };
}

/**
 * Build a conservative native-token gas budget from the chain's current fee
 * market without preparing or submitting a wallet transaction. This is used
 * only when Circle's bridge estimate does not include a usable gas amount for
 * a side of the bridge.
 */
export async function estimateWalletNativeGasBudget({ chainId, gasUnits }) {
  const resolvedChainId = Number(chainId || web3Config.requiredChain.id);
  const chain = readableChains().find((item) => item.id === resolvedChainId);
  if (!chain) throw new Error('This wallet network is not supported by the application.');

  const parsedGasUnits = Number(gasUnits);
  if (!Number.isSafeInteger(parsedGasUnits) || parsedGasUnits <= 0) {
    throw new Error('Fallback gas units are not configured correctly.');
  }

  const client = publicClientFor(resolvedChainId);
  let feePerGas = 0n;
  let feeSource = '';

  try {
    const fees = await client.estimateFeesPerGas();
    feePerGas = fees?.maxFeePerGas ?? fees?.gasPrice ?? 0n;
    if (feePerGas > 0n) feeSource = 'estimateFeesPerGas';
  } catch {
    // Some EVM-compatible networks/RPCs do not expose EIP-1559 fee estimation.
    // Fall through to eth_gasPrice below.
  }

  if (feePerGas <= 0n) {
    try {
      feePerGas = await client.getGasPrice();
      if (feePerGas > 0n) feeSource = 'getGasPrice';
    } catch (error) {
      throw new Error(
        `Unable to read the current gas price on ${chain.name}. ${String(error?.shortMessage || error?.message || error || '').trim()}`.trim(),
      );
    }
  }

  if (feePerGas <= 0n) {
    throw new Error(`The current gas price on ${chain.name} is unavailable.`);
  }

  const estimatedRaw = feePerGas * BigInt(parsedGasUnits);
  const decimals = safeDecimals(chain.nativeCurrency?.decimals) ?? 18;

  return {
    estimatedRaw,
    formatted: formatUnits(estimatedRaw, decimals),
    decimals,
    symbol: chain.nativeCurrency?.symbol || '',
    chainId: chain.id,
    chainName: chain.name,
    gasUnits: parsedGasUnits,
    feePerGas,
    feeSource,
  };
}

