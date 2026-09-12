import { formatUnits } from 'viem';
import { sanitizeUserFacingMessage } from '@/utils/error';

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

export const getWalletErrorMessage = (error, fallback = 'Privy secure account request could not be completed.') => {
  const message = error?.shortMessage || error?.details || error?.message || fallback;

  if (/user rejected|user denied|request rejected/i.test(message)) {
    return 'The secure confirmation was cancelled.';
  }
  if (/already pending|request of type.*already pending/i.test(message)) {
    return 'A Privy confirmation is already open. Complete it before trying again.';
  }
  if (
    /transport request timed out|transporttimeouterror|does not have a registered handler|failed to launch/i.test(
      message,
    )
  ) {
    return 'Privy did not respond. Confirm that you are signed in, then try again. No action was submitted.';
  }
  if (/provider not found|connector not connected|wallet provider is unavailable/i.test(message)) {
    return 'Your Privy secure account is unavailable in this session. Sign in again and try again.';
  }
  if (
    /contract function .*reverted|contractfunctionrevertederror|rpc request|transaction gas limit|gas limit too high|exceeds.*gas limit|cannot estimate gas|execution reverted|contract call:|docs:\s*https?:\/\//i.test(
      message,
    )
  ) {
    return 'Your Privy secure account could not prepare this action. Try again. If the issue continues, sign in with Privy again.';
  }
  if (
    /chain not configured|chainnotconfigurederror|unsupported chain|unsupported network|switch chain not supported/i.test(
      message,
    )
  ) {
    return 'Your Privy secure account needs a quick setup check. Open the account control and try again.';
  }

  return sanitizeUserFacingMessage(message.replace(/\s*Version:\s*@?wagmi\/core@[^\s]+.*$/i, '').trim() || fallback);
};
