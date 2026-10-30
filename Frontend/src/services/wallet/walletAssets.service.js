import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem';
import { web3Config } from '@/config/web3';

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: 'balance', type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
];

const clients = new Map();
const safeDecimals = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : null;
};

// Arc exposes the same USDC value in two units: eth_getBalance / gas uses
// 18-decimal native units, while the ERC-20 USDC face uses 6 decimals. The
// chain catalogue describes the token-facing USDC precision, so native RPC
// balances must use Arc's 18-decimal scale to avoid a 10^12 display/gas error.
export const resolveNativeRpcDecimals = ({ chainId, symbol, configuredDecimals } = {}) => {
  if (Number(chainId) === 5042002 && String(symbol || '').trim().toUpperCase() === 'USDC') return 18;
  return safeDecimals(configuredDecimals) ?? 18;
};
const normalizeAddress = (value, label) => {
  const normalized = String(value || '').trim();
  if (!isAddress(normalized)) throw new Error(`${label} is unavailable.`);
  return getAddress(normalized);
};

const publicClientFor = (chainId) => {
  const id = Number(chainId);
  const chain = web3Config.getWalletChainById(id);
  const record = web3Config.getWalletChainRecordById(id);
  if (!chain || !record?.publicRpcUrl) throw new Error('This wallet network is not configured for wallet balances.');
  if (!clients.has(id)) clients.set(id, createPublicClient({ chain, transport: http(record.publicRpcUrl) }));
  return clients.get(id);
};

export async function readWalletNativeBalance({ walletAddress, chainId }) {
  const account = normalizeAddress(walletAddress, 'Wallet address');
  const chain = web3Config.getWalletChainById(chainId);
  if (!chain) throw new Error('This wallet network is not configured for wallet balances.');
  const rawBalance = await publicClientFor(chain.id).getBalance({ address: account });
  const decimals = resolveNativeRpcDecimals({ chainId: chain.id, symbol: chain.nativeCurrency?.symbol, configuredDecimals: chain.nativeCurrency?.decimals });
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
  let resolvedDecimals = safeDecimals(decimals);
  try {
    const onchain = safeDecimals(Number(await client.readContract({ address, abi: ERC20_BALANCE_ABI, functionName: 'decimals' })));
    if (onchain !== null) resolvedDecimals = onchain;
  } catch (error) {
    if (resolvedDecimals === null) throw error;
  }
  if (resolvedDecimals === null) throw new Error('Token decimals are unavailable.');
  const rawBalance = await client.readContract({ address, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [account] });
  return { rawBalance, decimals: resolvedDecimals, formatted: formatUnits(rawBalance, resolvedDecimals) };
}

export async function estimateWalletNativeGasBudget({ chainId, gasUnits }) {
  const chain = web3Config.getWalletChainById(chainId);
  if (!chain) throw new Error('This wallet network is not configured for wallet balances.');
  const units = Number(gasUnits);
  if (!Number.isSafeInteger(units) || units <= 0) throw new Error('Fallback gas units are not configured correctly.');
  const client = publicClientFor(chain.id);
  let feePerGas = 0n;
  let feeSource = '';
  try {
    const fees = await client.estimateFeesPerGas();
    feePerGas = fees?.maxFeePerGas ?? fees?.gasPrice ?? 0n;
    if (feePerGas > 0n) feeSource = 'estimateFeesPerGas';
  } catch { /* fall through */ }
  if (feePerGas <= 0n) {
    feePerGas = await client.getGasPrice();
    if (feePerGas > 0n) feeSource = 'getGasPrice';
  }
  if (feePerGas <= 0n) throw new Error(`The current gas price on ${chain.name} is unavailable.`);
  const estimatedRaw = feePerGas * BigInt(units);
  const decimals = resolveNativeRpcDecimals({ chainId: chain.id, symbol: chain.nativeCurrency?.symbol, configuredDecimals: chain.nativeCurrency?.decimals });
  return { estimatedRaw, formatted: formatUnits(estimatedRaw, decimals), decimals, symbol: chain.nativeCurrency?.symbol || '', chainId: chain.id, chainName: chain.name, gasUnits: units, feePerGas, feeSource };
}
