import { formatUnits } from 'viem';

export const shortenWalletAddress = (address, leading = 5, trailing = 5) => {
  if (!address) return '';
  if (address.length <= leading + trailing) return address;
  return `${address.slice(0, leading)}...${address.slice(-trailing)}`;
};

export const formatWalletBalance = (balance, maximumFractionDigits = 4) => {
  if (!balance?.value && balance?.value !== 0n) return '—';

  const numeric = Number(formatUnits(balance.value, balance.decimals));
  if (!Number.isFinite(numeric)) return `— ${balance.symbol || ''}`.trim();

  return `${numeric.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} ${balance.symbol || ''}`.trim();
};

export const getWalletErrorMessage = (error, fallback = 'Wallet request could not be completed.') => {
  const message = error?.shortMessage || error?.details || error?.message || fallback;

  if (/user rejected|user denied|request rejected/i.test(message)) {
    return 'The wallet request was cancelled.';
  }
  if (/already pending|request of type.*already pending/i.test(message)) {
    return 'A wallet request is already open. Complete it in your wallet and try again.';
  }
  if (/project id|projectid/i.test(message)) {
    return 'WalletConnect is not configured. Add VITE_WALLETCONNECT_PROJECT_ID to the environment file.';
  }

  return message;
};
