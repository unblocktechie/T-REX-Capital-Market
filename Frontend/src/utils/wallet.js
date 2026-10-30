import { formatUnits } from 'viem';
import { sanitizeUserFacingMessage } from '@/utils/error';

export const shortenWalletAddress = (address, leading = 5, trailing = 5) => {
  if (!address) return '';
  if (address.length <= leading + trailing) return address;
  return `${address.slice(0, leading)}...${address.slice(-trailing)}`;
};

const EVM_NATIVE_BALANCE_DECIMALS = 18;

const formatReadableAmount = (value, decimals, symbol, maximumFractionDigits = 4) => {
  const numeric = Number(formatUnits(value, decimals));
  if (!Number.isFinite(numeric)) return `— ${symbol || ''}`.trim();

  return `${numeric.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} ${symbol || ''}`.trim();
};

/**
 * Native EVM balances returned by eth_getBalance are wei-denominated.
 * Keep the RPC balance conversion independent from ERC-20/token display
 * decimals so chains that use a stablecoin symbol for gas (for example USDC)
 * do not inflate a 20-unit native balance into trillions on screen.
 */
export const formatNativeWalletBalance = (value, symbol, maximumFractionDigits = 4) => {
  if (value === undefined || value === null) return '—';
  return formatReadableAmount(value, EVM_NATIVE_BALANCE_DECIMALS, symbol, maximumFractionDigits);
};

export const formatWalletBalance = (balance, maximumFractionDigits = 4) => {
  if (!balance?.value && balance?.value !== 0n) return '—';
  return formatNativeWalletBalance(balance.value, balance.symbol, maximumFractionDigits);
};

export const getWalletErrorMessage = (error, fallback = 'Wallet request could not be completed.') => {
  const message = error?.shortMessage || error?.details || error?.message || fallback;

  if (/user rejected|user denied|request rejected/i.test(message)) {
    return 'The wallet request was cancelled.';
  }
  if (/already pending|request of type.*already pending/i.test(message)) {
    return 'A wallet request is already open. Complete it in your wallet and try again.';
  }
  if (
    /transport request timed out|transporttimeouterror|metamask:\/\/connect|does not have a registered handler|failed to launch/i.test(
      message,
    )
  ) {
    return 'MetaMask did not respond. Open and unlock the browser extension, confirm this site is connected, then try again. No transaction was sent.';
  }
  if (/provider not found|connector not connected|wallet provider is unavailable/i.test(message)) {
    return 'The MetaMask browser extension is not available to this tab. Reconnect the wallet and try again.';
  }
  if (/project id|projectid/i.test(message)) {
    return 'Wallet connection is temporarily unavailable. Please use an available wallet option or try again later.';
  }
  if (
    /contract function .*reverted|contractfunctionrevertederror|rpc request|transaction gas limit|gas limit too high|exceeds.*gas limit|cannot estimate gas|execution reverted|contract call:|docs:\s*https?:\/\//i.test(
      message,
    )
  ) {
    return 'Your wallet could not prepare this transaction. Please try again. If the issue continues, reconnect your wallet and try once more.';
  }
  if (
    /chain not configured|chainnotconfigurederror|unsupported chain|unsupported network|switch chain not supported/i.test(
      message,
    )
  ) {
    return 'This wallet network is not supported. Please switch the network and try again.';
  }

  return sanitizeUserFacingMessage(message.replace(/\s*Version:\s*@?wagmi\/core@[^\s]+.*$/i, '').trim() || fallback);
};
