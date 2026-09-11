import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Info,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { isAddress, parseUnits } from 'viem';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { investmentApi } from '@/api/investments';
import {
  InvestorTokenActionHeader,
  InvestorTokenIdentityCard,
  LockedAddressField,
  RegisteredInvestorWalletGate,
  TokenActionCheck,
  TokenActionUnavailable,
} from '@/components/investor-marketplace/InvestorTokenActionPrimitives';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRegisteredInvestmentAction } from '@/hooks/useRegisteredInvestmentAction';
import { useRegisteredInvestorWalletGuard } from '@/hooks/useRegisteredInvestorWalletGuard';
import { useInvestorTokenWalletBalance } from '@/hooks/useInvestorTokenWalletBalance';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import {
  clearInvestorTokenTransferRecovery,
  loadInvestorTokenTransferRecovery,
  saveInvestorTokenTransferRecovery,
} from '@/services/investor/investorTokenTransferRecoveryStore';
import {
  isInvestorTokenTransferWalletRejection,
  submitInvestorTokenTransfer,
} from '@/services/investor/investorTokenTransferTransaction.service';
import { transactionExplorerName, transactionExplorerUrl } from '@/utils/blockExplorer';
import { getErrorMessage } from '@/utils/error';
import { getInvestmentActionContext } from '@/utils/investmentPurchase';
import { resolveCurrentTokenPriceExact } from '@/utils/tokenPrice';

const TRANSFER_STATUS = Object.freeze({
  PENDING_TRANSFER: 'PENDING_TRANSFER',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
});

const TRANSFER_STATE = Object.freeze({
  READY: 'READY',
  PREPARING: 'PREPARING',
  WALLET_CONFIRMATION: 'WALLET_CONFIRMATION',
  TRANSACTION_SUBMITTED: 'TRANSACTION_SUBMITTED',
  CONFIRMING: 'CONFIRMING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const BUSY_TRANSFER_STATES = new Set([
  TRANSFER_STATE.PREPARING,
  TRANSFER_STATE.WALLET_CONFIRMATION,
  TRANSFER_STATE.TRANSACTION_SUBMITTED,
  TRANSFER_STATE.CONFIRMING,
]);

const HISTORY_LIMIT = 5;
const HISTORY_POLL_INTERVAL_MS = 7_000;
const TRANSFER_POLL_INTERVAL_MS = 5_000;

const HISTORY_STATUS_OPTIONS = Object.freeze([
  { value: 'all', label: 'All statuses', description: 'Show every transfer' },
  { value: TRANSFER_STATUS.PENDING_TRANSFER, label: 'Pending', description: 'Transfer is still being finalized' },
  { value: TRANSFER_STATUS.COMPLETED, label: 'Completed', description: 'Transfer finalized successfully' },
  { value: TRANSFER_STATUS.EXPIRED, label: 'Expired', description: 'Transfer intent expired' },
  { value: TRANSFER_STATUS.MANUAL_REVIEW, label: 'Needs review', description: 'Transfer requires review' },
]);

const HISTORY_DIRECTION_OPTIONS = Object.freeze([
  { value: 'all', label: 'All activity', description: 'Sent and received transfers' },
  { value: 'sent', label: 'Sent', description: 'Tokens sent from your wallet' },
  { value: 'received', label: 'Received', description: 'Tokens received by your wallet' },
]);

const clean = (value) => String(value ?? '').trim();
const normalizeStatus = (value) => clean(value).toUpperCase();
const sameAddress = (left, right) => clean(left).toLowerCase() === clean(right).toLowerCase();
const validTransactionHash = (value) => /^0x[a-fA-F0-9]{64}$/.test(clean(value));

const normalizeDecimalInput = (value) => {
  const raw = clean(value).replace(/,/g, '');
  if (!raw) return '';
  if (!/^\d*(?:\.\d*)?$/.test(raw)) return null;
  return raw;
};

const canonicalDecimal = (value) => {
  const normalized = normalizeDecimalInput(value);
  if (normalized === null || !normalized) return '';
  const [wholeRaw = '0', fractionRaw = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const decimalPlaces = (value) => {
  const [, fraction = ''] = clean(value).split('.');
  return fraction.length;
};

const isPositiveDecimal = (value) => /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);

const safeParseUnits = (value, decimals) => {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
};

const formatExactAmount = (value) => {
  const normalized = canonicalDecimal(value);
  if (!normalized) return '';
  const [whole, fraction] = normalized.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
};

const shortHash = (value) => {
  const hash = clean(value);
  if (!hash) return '';
  return hash.length > 18 ? `${hash.slice(0, 9)}…${hash.slice(-7)}` : hash;
};

const shortAddress = (value) => {
  const address = clean(value);
  if (!address) return '—';
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
};

const transferUidOf = (transfer) => clean(
  transfer?.transferUid
  || transfer?.uid
  || transfer?.id,
);

const transactionRequestOf = (transfer) => {
  const request = transfer?.transactionRequest || transfer?.transaction?.request || transfer?.preparedTransaction;
  return request && typeof request === 'object' && !Array.isArray(request) ? request : null;
};

const txHashOf = (transfer) => {
  const direct = clean(
    transfer?.txHash
    || transfer?.transactionHash
    || transfer?.transaction?.txHash
    || transfer?.latestTransaction?.txHash
    || transfer?.confirmedTxHash,
  );
  if (direct) return direct;
  const history = transfer?.transactionHistory
    || transfer?.hashVerificationHistory
    || transfer?.transactions
    || [];
  if (!Array.isArray(history)) return '';
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const hash = clean(history[index]?.txHash || history[index]?.transactionHash || history[index]?.hash);
    if (hash) return hash;
  }
  return '';
};

const tokenUidOf = (token) => clean(token?.tokenUid || token?.id);

const recipientOf = (transfer) => clean(
  transfer?.recipientWalletAddress
  || transfer?.recipient?.walletAddress
  || transfer?.recipientAddress
  || transactionRequestOf(transfer)?.args?.[0],
);

const tokenAmountOf = (transfer) => clean(
  transfer?.tokenAmount
  || transfer?.amount
  || transfer?.tokenAmountDecimal,
);

const transferDirectionOf = (transfer, ownWallet) => {
  const explicit = clean(transfer?.direction).toLowerCase();
  if (explicit === 'sent' || explicit === 'received') return explicit;
  const sender = clean(transfer?.senderWalletAddress || transfer?.sender?.walletAddress || transfer?.from);
  return sameAddress(sender, ownWallet) ? 'sent' : 'received';
};

const counterpartOf = (transfer, ownWallet) => {
  const direction = transferDirectionOf(transfer, ownWallet);
  if (direction === 'sent') return recipientOf(transfer);
  return clean(transfer?.senderWalletAddress || transfer?.sender?.walletAddress || transfer?.from);
};

const createTransferKey = () => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `send-${uuid}`;
};

const formatHistoryDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value) || '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const historyStatusMeta = (status) => {
  switch (normalizeStatus(status)) {
    case TRANSFER_STATUS.PENDING_TRANSFER:
      return { label: 'Pending', tone: 'pending' };
    case TRANSFER_STATUS.COMPLETED:
      return { label: 'Completed', tone: 'completed' };
    case TRANSFER_STATUS.EXPIRED:
      return { label: 'Expired', tone: 'expired' };
    case TRANSFER_STATUS.MANUAL_REVIEW:
      return { label: 'Needs review', tone: 'neutral' };
    default:
      return { label: clean(status).replaceAll('_', ' ') || 'Unknown', tone: 'neutral' };
  }
};

const transferStatusMeta = (state, { hasPreparedIntent = false } = {}) => {
  switch (state) {
    case TRANSFER_STATE.PREPARING:
      return {
        label: 'Checking',
        title: 'Checking transfer details',
        detail: 'Your recipient and transfer amount are being verified before your wallet opens.',
        tone: 'pending',
        Icon: Clock3,
      };
    case TRANSFER_STATE.WALLET_CONFIRMATION:
      return {
        label: 'Wallet Confirmation',
        title: 'Confirm the transfer in your wallet',
        detail: 'Review the prepared recipient and token amount, then confirm when you are ready.',
        tone: 'pending',
        Icon: WalletCards,
      };
    case TRANSFER_STATE.TRANSACTION_SUBMITTED:
      return {
        label: 'Submitted',
        title: 'Transfer submitted',
        detail: 'Your transaction was submitted. The transfer will remain pending until it is fully verified.',
        tone: 'pending',
        Icon: Clock3,
      };
    case TRANSFER_STATE.CONFIRMING:
      return {
        label: 'Pending',
        title: 'Transfer is being finalized',
        detail: 'Your transaction has already been submitted. No additional wallet transaction is required while verification continues.',
        tone: 'pending',
        Icon: Clock3,
      };
    case TRANSFER_STATE.COMPLETED:
      return {
        label: 'Completed',
        title: 'Transfer completed',
        detail: 'The transfer has been fully verified and your balances have been updated.',
        tone: 'success',
        Icon: CheckCircle2,
      };
    case TRANSFER_STATE.EXPIRED:
      return {
        label: 'Expired',
        title: 'Transfer expired',
        detail: 'This transfer was not completed within the allowed time. You can start a new transfer when ready.',
        tone: 'neutral',
        Icon: XCircle,
      };
    case TRANSFER_STATE.MANUAL_REVIEW:
      return {
        label: 'Needs Review',
        title: 'Transfer needs review',
        detail: 'This transfer cannot be finalized automatically right now. No additional wallet transaction is required.',
        tone: 'neutral',
        Icon: Info,
      };
    case TRANSFER_STATE.FAILED:
      return {
        label: 'Needs Attention',
        title: 'Transfer needs attention',
        detail: 'Review the message below before continuing.',
        tone: 'error',
        Icon: XCircle,
      };
    case TRANSFER_STATE.CANCELLED:
      return {
        label: 'Wallet Cancelled',
        title: 'Wallet request cancelled',
        detail: 'Your prepared transfer is still saved. You can continue with the same transfer details when ready.',
        tone: 'neutral',
        Icon: XCircle,
      };
    case TRANSFER_STATE.READY:
    default:
      return hasPreparedIntent
        ? {
            label: 'Prepared',
            title: 'Transfer ready for wallet confirmation',
            detail: 'The recipient and amount have been verified. Continue to submit this prepared transfer from your registered wallet.',
            tone: 'success',
            Icon: ShieldCheck,
          }
        : {
            label: 'Ready',
            title: 'Ready to send',
            detail: 'Enter the recipient and amount. They will be verified before your wallet opens.',
            tone: 'neutral',
            Icon: ShieldCheck,
          };
  }
};

const replacementTransactionRequired = (error) => {
  const payload = error?.response?.data || {};
  const detail = payload?.data || payload?.error || {};
  if (
    payload?.requiresNewTransaction === true
    || payload?.newTransactionRequired === true
    || detail?.requiresNewTransaction === true
    || detail?.newTransactionRequired === true
    || detail?.transactionRequired === true
  ) return true;

  const code = clean(detail?.code || payload?.code).toUpperCase();
  if (/NEW_TRANSACTION_REQUIRED|TRANSACTION_REQUIRED|REPLACEMENT_TRANSACTION/.test(code)) return true;

  const message = clean(detail?.message || payload?.message || error?.message).toLowerCase();
  return /new (wallet )?transaction (is )?required|replacement transaction (is )?required/.test(message);
};

export default function SendTokenPage({
  interestUid: interestUidOverride,
  embedded = false,
}) {
  const { interestUid: routeInterestUid } = useParams();
  const resolvedInterestUid = interestUidOverride || routeInterestUid || '';
  const { application, token, loading, error, ready } = useRegisteredInvestmentAction(resolvedInterestUid);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [addressChecked, setAddressChecked] = useState(false);
  const [transferState, setTransferState] = useState(TRANSFER_STATE.READY);
  const [transferRecord, setTransferRecord] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [transferError, setTransferError] = useState('');
  const [replacementAllowed, setReplacementAllowed] = useState(false);
  const [retryingVerification, setRetryingVerification] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState({ page: 1, total: 0, totalPages: 1 });
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState('all');
  const [historyDirection, setHistoryDirection] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historySearchDebounced, setHistorySearchDebounced] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const recoveryLoadKeyRef = useRef('');
  const completionRef = useRef('');

  useDocumentTitle(
    embedded ? 'Manage Tokens' : token ? `${token.name} · Send Tokens` : 'Send Tokens',
  );

  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const walletGuard = useRegisteredInvestorWalletGuard(context.investorWalletAddress, context.chainId);
  const {
    balance: tokenWalletBalance,
    rawBalance: tokenWalletRawBalance,
    loading: tokenWalletBalanceLoading,
    refresh: refreshTokenWalletBalance,
  } = useInvestorTokenWalletBalance({
    tokenAddress: context.tokenAddress,
    investorWalletAddress: context.investorWalletAddress,
    chainId: context.chainId || walletGuard.targetChainId,
    tokenDecimals: token?.decimals,
  });

  const parsedTokenDecimals = Number(token?.decimals);
  const tokenDecimals = Number.isSafeInteger(parsedTokenDecimals)
    && parsedTokenDecimals >= 0
    && parsedTokenDecimals <= 36
    ? parsedTokenDecimals
    : null;
  const normalizedAmount = canonicalDecimal(amount);
  const amountRaw = tokenDecimals !== null && isPositiveDecimal(normalizedAmount)
    ? safeParseUnits(normalizedAmount, tokenDecimals)
    : null;
  const balanceAvailable = typeof tokenWalletRawBalance === 'bigint';
  const transferBusy = BUSY_TRANSFER_STATES.has(transferState);

  const activeTransferUid = transferUidOf(transferRecord) || clean(recovery?.transferUid);
  const transferPriceExact = canonicalDecimal(
    (activeTransferUid && (
      transferRecord?.tokenPriceSnapshot
      || transferRecord?.tokenPrice
      || transferRecord?.currentTokenPrice
      || transferRecord?.pricePerToken
    ))
    || resolveCurrentTokenPriceExact(token || {}),
  );
  const transferPriceNumber = Number(transferPriceExact);
  const estimatedTransferValue = Number.isFinite(transferPriceNumber)
    && transferPriceNumber > 0
    && Number(normalizedAmount) > 0
    ? Number(normalizedAmount) * transferPriceNumber
    : null;
  const serverStatus = normalizeStatus(transferRecord?.status || recovery?.status);
  const preparedTransactionRequest = transactionRequestOf(transferRecord) || recovery?.transactionRequest || null;
  const knownHash = txHashOf(transferRecord) || txHash || clean(recovery?.txHash);
  const pendingIntent = Boolean(activeTransferUid && serverStatus === TRANSFER_STATUS.PENDING_TRANSFER);
  const hasPreparedIntent = Boolean(pendingIntent && preparedTransactionRequest && !knownHash);
  const formLocked = transferBusy || pendingIntent;

  const recipientError = useMemo(() => {
    if (!recipient.trim()) return '';
    if (!isAddress(recipient.trim())) return 'Enter a valid recipient wallet address.';
    if (sameAddress(recipient, context.investorWalletAddress)) {
      return 'Choose a recipient wallet different from your registered investment wallet.';
    }
    return '';
  }, [context.investorWalletAddress, recipient]);

  const amountError = useMemo(() => {
    if (!clean(amount)) return '';
    if (!normalizedAmount || !isPositiveDecimal(normalizedAmount)) {
      return 'Enter a token amount greater than zero.';
    }
    if (tokenDecimals !== null && decimalPlaces(amount) > tokenDecimals) {
      return `Enter no more than ${tokenDecimals} decimal place${tokenDecimals === 1 ? '' : 's'} for ${token?.symbol || 'this token'}.`;
    }
    if (tokenDecimals !== null && amountRaw === null) {
      return `Enter a valid ${token?.symbol || 'token'} amount.`;
    }
    if (balanceAvailable && amountRaw !== null && amountRaw > tokenWalletRawBalance) {
      return `The transfer amount cannot exceed your available wallet balance of ${tokenWalletBalance || '0'} ${token?.symbol || 'tokens'}.`;
    }
    return '';
  }, [amount, amountRaw, balanceAvailable, normalizedAmount, token?.symbol, tokenDecimals, tokenWalletBalance, tokenWalletRawBalance]);

  const persistRecovery = useCallback((patch = {}) => {
    const next = saveInvestorTokenTransferRecovery(resolvedInterestUid, patch);
    setRecovery(next);
    return next;
  }, [resolvedInterestUid]);

  const applyTransfer = useCallback((next, fallback = {}) => {
    if (!next || typeof next !== 'object') return next;
    const uid = transferUidOf(next) || clean(fallback.transferUid);
    const status = normalizeStatus(next?.status || fallback.status);
    const request = transactionRequestOf(next) || fallback.transactionRequest || null;
    const hash = txHashOf(next) || clean(fallback.txHash);
    const nextRecipient = recipientOf(next) || clean(fallback.recipientWalletAddress);
    const nextAmount = tokenAmountOf(next) || clean(fallback.tokenAmount);

    setTransferRecord(next);
    if (nextRecipient) {
      setRecipient(nextRecipient);
      setAddressChecked(isAddress(nextRecipient));
    }
    if (nextAmount) setAmount(nextAmount);
    if (hash) setTxHash(hash);

    if (status === TRANSFER_STATUS.COMPLETED) {
      setTransferState(TRANSFER_STATE.COMPLETED);
      setTransferError('');
      setReplacementAllowed(false);
      clearInvestorTokenTransferRecovery(resolvedInterestUid);
      setRecovery(null);
      return next;
    }

    if (status === TRANSFER_STATUS.EXPIRED) {
      setTransferState(TRANSFER_STATE.EXPIRED);
      setTransferError('');
      setReplacementAllowed(false);
      clearInvestorTokenTransferRecovery(resolvedInterestUid);
      setRecovery(null);
      return next;
    }

    if (status === TRANSFER_STATUS.MANUAL_REVIEW) {
      setTransferState(TRANSFER_STATE.MANUAL_REVIEW);
      setReplacementAllowed(false);
      clearInvestorTokenTransferRecovery(resolvedInterestUid);
      setRecovery(null);
      return next;
    }

    if (uid && status === TRANSFER_STATUS.PENDING_TRANSFER) {
      persistRecovery({
        tokenUid: tokenUidOf(token) || clean(fallback.tokenUid),
        transferUid: uid,
        recipientWalletAddress: nextRecipient,
        tokenAmount: nextAmount,
        ...(clean(next?.idempotencyKey || fallback.idempotencyKey)
          ? { idempotencyKey: clean(next?.idempotencyKey || fallback.idempotencyKey) }
          : {}),
        txHash: hash,
        status,
        transactionRequest: request,
      });
      if (hash) {
        setTransferState(TRANSFER_STATE.CONFIRMING);
      } else {
        setTransferState((current) => (
          [TRANSFER_STATE.CANCELLED, TRANSFER_STATE.FAILED].includes(current)
            ? current
            : TRANSFER_STATE.READY
        ));
      }
    }

    return next;
  }, [persistRecovery, resolvedInterestUid, token]);

  const loadHistory = useCallback(async ({ quiet = false } = {}) => {
    const tokenUid = tokenUidOf(token);
    if (!tokenUid) return;
    quiet ? setHistoryRefreshing(true) : setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await investmentApi.listTokenTransfers(tokenUid, {
        page: historyPage,
        limit: HISTORY_LIMIT,
        search: historySearchDebounced,
        status: historyStatus,
        direction: historyDirection,
      });
      const rows = Array.isArray(response?.data) ? response.data : [];
      const meta = response?.meta || {};
      const total = Number(meta?.total ?? meta?.totalItems ?? meta?.count ?? rows.length) || 0;
      const totalPages = Math.max(1, Number(meta?.totalPages ?? meta?.pages ?? Math.ceil(total / HISTORY_LIMIT)) || 1);
      const page = Math.min(Math.max(Number(meta?.page ?? historyPage) || 1, 1), totalPages);
      setHistory(rows);
      setHistoryMeta({ page, total, totalPages });
    } catch (historyLoadError) {
      setHistoryError(getErrorMessage(historyLoadError, 'Transfer history is temporarily unavailable.'));
    } finally {
      setHistoryLoading(false);
      setHistoryRefreshing(false);
    }
  }, [historyDirection, historyPage, historySearchDebounced, historyStatus, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistorySearchDebounced(clean(historySearch)), 350);
    return () => window.clearTimeout(timer);
  }, [historySearch]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyDirection, historySearchDebounced, historyStatus]);

  useEffect(() => {
    if (!ready || !tokenUidOf(token)) return undefined;
    loadHistory();
    return undefined;
  }, [loadHistory, ready, token]);

  useEffect(() => {
    const hasPendingHistory = history.some((row) => normalizeStatus(row?.status) === TRANSFER_STATUS.PENDING_TRANSFER);
    if (!hasPendingHistory) return undefined;
    const timer = window.setInterval(() => loadHistory({ quiet: true }), HISTORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [history, loadHistory]);

  useEffect(() => {
    if (historyPage > historyMeta.totalPages) setHistoryPage(Math.max(historyMeta.totalPages, 1));
  }, [historyMeta.totalPages, historyPage]);

  useEffect(() => {
    if (serverStatus !== TRANSFER_STATUS.COMPLETED || !activeTransferUid) return;
    if (completionRef.current === activeTransferUid) return;
    completionRef.current = activeTransferUid;
    refreshTokenWalletBalance?.();
    investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
    loadHistory({ quiet: true });
    toast.success('Transfer completed', {
      description: 'The transfer has been fully verified and your balances have been updated.',
    });
  }, [activeTransferUid, loadHistory, refreshTokenWalletBalance, serverStatus]);

  useEffect(() => {
    if (!ready || !resolvedInterestUid || !tokenUidOf(token)) return undefined;
    const loadKey = `${resolvedInterestUid}:${tokenUidOf(token)}`;
    if (recoveryLoadKeyRef.current === loadKey) return undefined;
    recoveryLoadKeyRef.current = loadKey;

    let cancelled = false;
    const restore = async () => {
      const stored = loadInvestorTokenTransferRecovery(resolvedInterestUid);
      if (!stored) return;
      if (stored.tokenUid && stored.tokenUid !== tokenUidOf(token)) {
        clearInvestorTokenTransferRecovery(resolvedInterestUid);
        return;
      }

      setRecovery(stored);
      if (stored.recipientWalletAddress) {
        setRecipient(stored.recipientWalletAddress);
        setAddressChecked(isAddress(stored.recipientWalletAddress));
      }
      if (stored.tokenAmount) setAmount(stored.tokenAmount);
      if (stored.txHash) setTxHash(stored.txHash);

      try {
        let next;
        if (stored.transferUid) {
          next = await investmentApi.getTokenTransfer(stored.transferUid);
        } else if (stored.idempotencyKey && stored.recipientWalletAddress && stored.tokenAmount) {
          next = await investmentApi.createTokenTransfer(tokenUidOf(token), {
            recipientWalletAddress: stored.recipientWalletAddress,
            tokenAmount: stored.tokenAmount,
            idempotencyKey: stored.idempotencyKey,
          });
        }
        if (!cancelled && next) applyTransfer(next, stored);
      } catch {
        if (cancelled) return;
        if (stored.transferUid) {
          setTransferRecord({
            transferUid: stored.transferUid,
            status: stored.status || TRANSFER_STATUS.PENDING_TRANSFER,
            transactionRequest: stored.transactionRequest,
            txHash: stored.txHash,
          });
          setTransferState(stored.txHash ? TRANSFER_STATE.CONFIRMING : TRANSFER_STATE.READY);
        }
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [applyTransfer, ready, resolvedInterestUid, token]);

  useEffect(() => {
    if (!activeTransferUid || serverStatus !== TRANSFER_STATUS.PENDING_TRANSFER || replacementAllowed) return undefined;
    let cancelled = false;
    let timer;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const next = await investmentApi.getTokenTransfer(activeTransferUid);
        if (!cancelled) {
          applyTransfer(next, {
            transferUid: activeTransferUid,
            txHash: knownHash,
            transactionRequest: preparedTransactionRequest,
            recipientWalletAddress: recipient,
            tokenAmount: normalizedAmount,
          });
        }
      } catch {
        // Temporary connectivity/RPC verification issues must not be treated as a failed transfer.
      } finally {
        inFlight = false;
        if (!cancelled) timer = window.setTimeout(poll, TRANSFER_POLL_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(poll, TRANSFER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeTransferUid, applyTransfer, knownHash, normalizedAmount, preparedTransactionRequest, recipient, replacementAllowed, serverStatus]);

  const handleRecipientChange = (event) => {
    if (formLocked) return;
    setTransferError('');
    setReplacementAllowed(false);
    setRecipient(event.target.value);
    setAddressChecked(false);
  };

  const handleAmountChange = (event) => {
    if (formLocked) return;
    const normalized = normalizeDecimalInput(event.target.value);
    if (normalized === null) return;
    setTransferError('');
    setReplacementAllowed(false);
    setAmount(normalized);
  };

  const checkRecipient = () => {
    if (!recipient.trim() || recipientError) {
      setAddressChecked(false);
      toast.error(recipientError || 'Enter a recipient wallet address to continue.');
      return;
    }
    setAddressChecked(true);
    toast.success('Recipient address ready', {
      description: 'The recipient will be checked for transfer eligibility before your wallet opens.',
    });
  };

  const confirmKnownHash = useCallback(async (transferUid, hash, fallback = {}) => {
    if (!transferUid || !validTransactionHash(hash)) return null;
    setTransferState(TRANSFER_STATE.CONFIRMING);
    try {
      const next = await investmentApi.confirmTokenTransfer(transferUid, hash);
      setTransferError('');
      setReplacementAllowed(false);
      applyTransfer(next, { ...fallback, transferUid, txHash: hash });
      loadHistory({ quiet: true });
      return next;
    } catch (confirmError) {
      const message = getErrorMessage(
        confirmError,
        'Your transaction was submitted, but its transfer status could not be verified yet.',
      );
      if (replacementTransactionRequired(confirmError)) {
        setReplacementAllowed(true);
        setTransferState(TRANSFER_STATE.FAILED);
        setTransferError(message);
        toast.error('A new wallet transaction is required', { description: message });
      } else {
        setTransferState(TRANSFER_STATE.CONFIRMING);
        setTransferError('Your transaction is submitted and verification is still in progress. No additional wallet transaction is required.');
      }
      loadHistory({ quiet: true });
      return null;
    }
  }, [applyTransfer, loadHistory]);

  const broadcastPreparedTransfer = useCallback(async (record, fallback = {}) => {
    const transferUid = transferUidOf(record) || clean(fallback.transferUid);
    const request = transactionRequestOf(record) || fallback.transactionRequest;
    if (!transferUid || !request) {
      throw new Error('The prepared transfer details are unavailable. Refresh the transfer status and try again.');
    }

    setTransferError('');
    setReplacementAllowed(false);
    setTransferState(TRANSFER_STATE.WALLET_CONFIRMATION);

    try {
      const hash = await submitInvestorTokenTransfer({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        investorWalletAddress: context.investorWalletAddress,
        transactionRequest: request,
      });

      setTxHash(hash);
      setTransferState(TRANSFER_STATE.TRANSACTION_SUBMITTED);
      persistRecovery({
        tokenUid: tokenUidOf(token),
        transferUid,
        recipientWalletAddress: recipientOf(record) || recipient,
        tokenAmount: tokenAmountOf(record) || normalizedAmount,
        idempotencyKey: clean(record?.idempotencyKey || fallback.idempotencyKey || recovery?.idempotencyKey),
        txHash: hash,
        status: TRANSFER_STATUS.PENDING_TRANSFER,
        transactionRequest: request,
      });
      toast.info('Transfer submitted', {
        description: 'Your transfer is being finalized. No additional wallet transaction is required.',
      });
      await confirmKnownHash(transferUid, hash, {
        transactionRequest: request,
        recipientWalletAddress: recipientOf(record) || recipient,
        tokenAmount: tokenAmountOf(record) || normalizedAmount,
      });
    } catch (sendError) {
      if (isInvestorTokenTransferWalletRejection(sendError)) {
        setTransferState(TRANSFER_STATE.CANCELLED);
        setTransferError('');
        toast.info('Wallet request cancelled', {
          description: 'Your prepared transfer is still saved. You can continue it when ready.',
        });
        return;
      }
      setTransferState(TRANSFER_STATE.FAILED);
      const message = getErrorMessage(sendError, 'The transfer could not be submitted from your wallet.');
      setTransferError(message);
      toast.error('Transfer needs attention', { description: message });
    }
  }, [confirmKnownHash, context.investorWalletAddress, normalizedAmount, persistRecovery, recipient, recovery?.idempotencyKey, token, walletGuard.wallet.address, walletGuard.wallet.connector]);

  const validateFormForNewIntent = () => {
    if (!walletGuard.ready) {
      toast.error('Connect the investor wallet linked to your profile on the required network to continue.');
      return false;
    }
    if (!addressChecked || recipientError || !isAddress(recipient.trim())) {
      toast.error(recipientError || 'Enter and validate a recipient wallet address.');
      return false;
    }
    if (!normalizedAmount || !isPositiveDecimal(normalizedAmount) || amountError) {
      toast.error(amountError || 'Enter a token amount greater than zero.');
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (!walletGuard.ready) {
      toast.error('Connect the investor wallet linked to your profile on the required network to continue.');
      return;
    }

    if (transferState === TRANSFER_STATE.MANUAL_REVIEW || transferState === TRANSFER_STATE.COMPLETED) return;

    if (transferState === TRANSFER_STATE.EXPIRED) {
      setTransferRecord(null);
      setRecovery(null);
      setTxHash('');
      setTransferError('');
      setReplacementAllowed(false);
      setTransferState(TRANSFER_STATE.READY);
    }

    if (pendingIntent && preparedTransactionRequest) {
      if (knownHash && !replacementAllowed) {
        toast.info('Transfer already submitted', {
          description: 'Verification is still in progress. No additional wallet transaction is required.',
        });
        return;
      }
      await broadcastPreparedTransfer(transferRecord || { transferUid: activeTransferUid, transactionRequest: preparedTransactionRequest }, {
        transferUid: activeTransferUid,
        transactionRequest: preparedTransactionRequest,
        idempotencyKey: recovery?.idempotencyKey,
      });
      return;
    }

    if (!validateFormForNewIntent()) return;
    const tokenUid = tokenUidOf(token);
    if (!tokenUid) {
      toast.error('The token identifier is unavailable. Refresh the page and try again.');
      return;
    }

    const canResumePrepareRequest = Boolean(
      recovery?.idempotencyKey
      && !recovery?.transferUid
      && sameAddress(recovery?.recipientWalletAddress, recipient.trim())
      && canonicalDecimal(recovery?.tokenAmount) === normalizedAmount,
    );
    const idempotencyKey = canResumePrepareRequest ? recovery.idempotencyKey : createTransferKey();
    setTransferState(TRANSFER_STATE.PREPARING);
    setTransferError('');
    setTxHash('');
    if (!canResumePrepareRequest) {
      clearInvestorTokenTransferRecovery(resolvedInterestUid);
      setRecovery(null);
    }
    persistRecovery({
      tokenUid,
      transferUid: '',
      recipientWalletAddress: recipient.trim(),
      tokenAmount: normalizedAmount,
      idempotencyKey,
      txHash: '',
      status: TRANSFER_STATUS.PENDING_TRANSFER,
      transactionRequest: null,
    });

    try {
      const prepared = await investmentApi.createTokenTransfer(tokenUid, {
        recipientWalletAddress: recipient.trim(),
        tokenAmount: normalizedAmount,
        idempotencyKey,
      });
      applyTransfer(prepared, {
        tokenUid,
        recipientWalletAddress: recipient.trim(),
        tokenAmount: normalizedAmount,
        idempotencyKey,
      });
      loadHistory({ quiet: true });

      const preparedStatus = normalizeStatus(prepared?.status);
      const preparedHash = txHashOf(prepared);
      if (preparedStatus === TRANSFER_STATUS.COMPLETED) return;
      if (preparedStatus !== TRANSFER_STATUS.PENDING_TRANSFER) return;
      if (preparedHash) {
        await confirmKnownHash(transferUidOf(prepared), preparedHash, {
          transactionRequest: transactionRequestOf(prepared),
          recipientWalletAddress: recipientOf(prepared) || recipient.trim(),
          tokenAmount: tokenAmountOf(prepared) || normalizedAmount,
          idempotencyKey,
        });
        return;
      }
      await broadcastPreparedTransfer(prepared, { idempotencyKey });
    } catch (prepareError) {
      setTransferState(TRANSFER_STATE.FAILED);
      const message = getErrorMessage(
        prepareError,
        'This transfer could not be prepared. Review the recipient and amount, then try again.',
      );
      setTransferError(message);
      toast.error('Unable to prepare transfer', { description: message });
    }
  };

  const handleRetryVerification = async () => {
    if (!activeTransferUid || retryingVerification) return;
    setRetryingVerification(true);
    try {
      const next = await investmentApi.retryTokenTransfer(activeTransferUid);
      setTransferError('');
      applyTransfer(next, {
        transferUid: activeTransferUid,
        txHash: knownHash,
        transactionRequest: preparedTransactionRequest,
        recipientWalletAddress: recipient,
        tokenAmount: normalizedAmount,
      });
      loadHistory({ quiet: true });
      toast.info('Transfer status refreshed', {
        description: normalizeStatus(next?.status) === TRANSFER_STATUS.COMPLETED
          ? 'The transfer is complete.'
          : 'Verification will continue without submitting another wallet transaction.',
      });
    } catch (retryError) {
      const message = getErrorMessage(retryError, 'The transfer status could not be refreshed right now.');
      setTransferError(message);
      toast.error('Unable to refresh transfer status', { description: message });
    } finally {
      setRetryingVerification(false);
    }
  };

  if (loading) {
    return <div className="page-stack investor-token-action-page"><div className="investor-token-action-loading" /><div className="investor-token-action-loading investor-token-action-loading--tall" /></div>;
  }

  if (error || !application || !token) {
    return (
      <TokenActionUnavailable
        title="Send Tokens"
        description="This investment could not be loaded right now."
      />
    );
  }

  if (!ready) {
    return (
      <TokenActionUnavailable
        title="Send Tokens"
        description="Token transfers are not available for this application yet."
      />
    );
  }

  const statusMeta = transferStatusMeta(transferState, { hasPreparedIntent });
  const StatusIcon = statusMeta.Icon;
  const explorerUrl = transactionExplorerUrl(knownHash, preparedTransactionRequest?.chainId || context.chainId || walletGuard.targetChainId);
  const explorerName = transactionExplorerName(preparedTransactionRequest?.chainId || context.chainId || walletGuard.targetChainId);
  const formattedAmount = formatExactAmount(amount);
  const amountWithinBalance = Boolean(
    normalizedAmount
      && isPositiveDecimal(normalizedAmount)
      && (!balanceAvailable || amountRaw === null || amountRaw <= tokenWalletRawBalance),
  );

  const canPrepareNew = Boolean(
    walletGuard.ready
      && addressChecked
      && isAddress(recipient.trim())
      && !recipientError
      && normalizedAmount
      && isPositiveDecimal(normalizedAmount)
      && !amountError
      && !transferBusy,
  );
  const canBroadcastPrepared = Boolean(
    walletGuard.ready
      && pendingIntent
      && preparedTransactionRequest
      && (!knownHash || replacementAllowed)
      && !transferBusy,
  );
  const canSend = pendingIntent ? canBroadcastPrepared : canPrepareNew;
  const transferCompleted = transferState === TRANSFER_STATE.COMPLETED;

  const ctaLabel = transferState === TRANSFER_STATE.PREPARING
    ? 'Checking Transfer'
    : transferState === TRANSFER_STATE.WALLET_CONFIRMATION
      ? 'Confirm in Wallet'
      : [TRANSFER_STATE.TRANSACTION_SUBMITTED, TRANSFER_STATE.CONFIRMING].includes(transferState)
        ? 'Finalizing Transfer'
        : transferState === TRANSFER_STATE.COMPLETED
          ? 'Transfer Completed'
          : transferState === TRANSFER_STATE.EXPIRED
            ? 'Start New Transfer'
            : transferState === TRANSFER_STATE.MANUAL_REVIEW
              ? 'Transfer Under Review'
              : replacementAllowed
                ? 'Send Replacement Transaction'
                : hasPreparedIntent || transferState === TRANSFER_STATE.CANCELLED
                  ? 'Continue Transfer'
                  : 'Send Tokens';

  const ctaFootnote = knownHash && pendingIntent && !replacementAllowed
    ? 'This transfer is already submitted. Do not submit another wallet transaction while verification is in progress.'
    : replacementAllowed
      ? 'A previous transaction could not be used. Continue only because a new wallet transaction is required for this saved transfer.'
      : hasPreparedIntent || transferState === TRANSFER_STATE.CANCELLED
        ? 'This transfer is already prepared. Continuing uses the same verified recipient and amount.'
        : 'Your recipient and amount are verified before your wallet opens.';

  const historyCurrentPage = Math.min(Math.max(historyMeta.page || historyPage, 1), Math.max(historyMeta.totalPages, 1));
  const historyHasPending = history.some((row) => normalizeStatus(row?.status) === TRANSFER_STATUS.PENDING_TRANSFER);

  return (
    <div className="page-stack investor-token-action-page investor-token-send-page">
      {!embedded ? (
        <InvestorTokenActionHeader
          eyebrow="Token action"
          title="Send Tokens"
          description="Send tokens to another wallet that is approved to receive this security token."
        />
      ) : null}

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Approved investor" />

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div><span>Selected token</span><h2>Transfer from your registered wallet</h2></div>
              <WalletCards size={19} />
            </div>
            <LockedAddressField label="Primary Investment Wallet" value={context.investorWalletAddress} />
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div><span>Recipient</span><h2>Where are you sending tokens?</h2></div>
              <Send size={19} />
            </div>
            <div className="investor-token-action-recipient-row">
              <label className={`investor-token-action-text-field ${addressChecked && !recipientError ? 'is-checked' : ''} ${recipientError ? 'is-invalid' : ''} ${formLocked ? 'is-locked' : ''}`}>
                <span className="sr-only">Recipient wallet address</span>
                <input
                  value={recipient}
                  onChange={handleRecipientChange}
                  placeholder="0x… recipient wallet address"
                  spellCheck="false"
                  autoComplete="off"
                  aria-invalid={Boolean(recipientError)}
                  disabled={formLocked}
                />
                {addressChecked && !recipientError ? <CheckCircle2 size={17} /> : null}
              </label>
              <Button
                variant="secondary"
                onClick={checkRecipient}
                disabled={formLocked || !recipient.trim() || Boolean(recipientError)}
              >
                Validate Address
              </Button>
            </div>
            {recipientError ? <p className="investor-token-action-field-error">{recipientError}</p> : null}
            <p className="investor-token-action-helper">The recipient wallet and transfer eligibility are verified before your wallet opens.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div><span>Amount to transfer</span><h2>Enter the token amount</h2></div>
              <small>
                {tokenWalletBalanceLoading
                  ? 'Available to send: Loading…'
                  : balanceAvailable
                    ? `Available to send: ${tokenWalletBalance} ${token.symbol}`
                    : 'Balance will be verified before sending'}
              </small>
            </div>
            <label className={`investor-token-action-amount-field ${amountError ? 'is-invalid' : ''} ${formLocked ? 'is-locked' : ''}`}>
              <span className="sr-only">Token amount to transfer</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                aria-invalid={Boolean(amountError)}
                disabled={formLocked}
              />
              <strong>{token.symbol}</strong>
            </label>
            {amountError ? <p className="investor-token-action-field-error">{amountError}</p> : null}
            <p className="investor-token-action-field-hint">Enter the amount you want to send. Your available transferable balance is verified before the wallet transaction is prepared.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading"><div><span>Transfer checks</span><h2>Ready for wallet confirmation</h2></div><ShieldCheck size={19} /></div>
            <div className="investor-token-action-checks">
              <TokenActionCheck
                icon={UserRoundCheck}
                label="Recipient address"
                detail="The wallet address format is checked before the transfer is prepared."
                status={addressChecked && !recipientError ? 'Address ready' : 'Check required'}
                tone={addressChecked && !recipientError ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={WalletCards}
                label="Transfer amount"
                detail="Your amount is checked before the transfer is prepared for your wallet."
                status={amountWithinBalance ? 'Amount ready' : 'Check required'}
                tone={amountWithinBalance ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={ShieldCheck}
                label="Transfer eligibility"
                detail="Investor eligibility, token restrictions and available transferable balance are verified before your wallet opens."
                status={pendingIntent || transferCompleted ? 'Verified' : 'Checked on Send'}
                tone={pendingIntent || transferCompleted ? 'success' : 'neutral'}
              />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title"><span>Transfer summary</span><Send size={18} /></div>
            <div className="investor-token-order-row"><span>Send Amount</span><strong>{formattedAmount ? `${formattedAmount} ${token.symbol}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>{activeTransferUid ? 'Transfer Price' : 'Current Token Price'}</span><strong>{transferPriceExact ? `${formatExactAmount(transferPriceExact)} ${token.currency || 'USDT'}` : '—'}</strong></div>
            <div className="investor-token-order-row investor-token-order-row--primary"><span>Estimated Value</span><strong>{estimatedTransferValue === null ? '—' : `${estimatedTransferValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token.currency || 'USDT'}`}</strong></div>
            <div className="investor-token-order-row"><span>Recipient</span><strong className="investor-token-order-address">{recipient || 'Not entered'}</strong></div>
            <div className="investor-token-order-row"><span>Network</span><strong>{walletGuard.targetNetworkLabel}</strong></div>
            <div className="investor-token-order-row">
              <span>Wallet Balance</span>
              <strong>
                {tokenWalletBalanceLoading
                  ? 'Loading…'
                  : balanceAvailable
                    ? `${tokenWalletBalance} ${token.symbol || ''}`
                    : `— ${token.symbol || ''}`}
              </strong>
            </div>
            <div className="investor-token-order-row investor-token-transfer-status-row">
              <span>Status</span>
              <strong><span className={`investor-token-transfer-status-badge is-${statusMeta.tone}`}>{statusMeta.label}</span></strong>
            </div>
            {knownHash ? (
              <div className="investor-token-order-row investor-token-transfer-hash-row">
                <span>Transaction</span>
                <strong>
                  {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" title={`View transaction on ${explorerName}`}>
                      {shortHash(knownHash)} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : shortHash(knownHash)}
                </strong>
              </div>
            ) : null}

            <div className={`investor-token-transfer-state is-${statusMeta.tone}`} role="status" aria-live="polite">
              <StatusIcon size={17} aria-hidden="true" />
              <div>
                <strong>{statusMeta.title}</strong>
                <p>{transferError || statusMeta.detail}</p>
              </div>
            </div>

            {pendingIntent && knownHash ? (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCcw}
                onClick={handleRetryVerification}
                disabled={retryingVerification || transferBusy}
                loading={retryingVerification}
                className="investor-token-transfer-retry"
              >
                Refresh transfer status
              </Button>
            ) : null}

            <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="send tokens" />
            <Button
              className="investor-token-order-card__cta"
              icon={transferCompleted ? CheckCircle2 : Send}
              onClick={handleSend}
              disabled={
                transferCompleted
                || transferState === TRANSFER_STATE.MANUAL_REVIEW
                || (pendingIntent && knownHash && !replacementAllowed)
                || (!canSend && transferState !== TRANSFER_STATE.EXPIRED)
              }
              loading={transferBusy}
            >
              {ctaLabel}
            </Button>
            <small className="investor-token-order-card__footnote">{ctaFootnote}</small>
          </Card>
        </aside>
      </div>

      <Card className="investor-token-purchase-history investor-token-transfer-history">
        <div className="investor-token-purchase-history__header">
          <div className="investor-token-purchase-history__heading">
            <span className="investor-token-purchase-history__icon"><History size={18} /></span>
            <div>
              <h2>Transfer History</h2>
              <p>Track sent and received {token.symbol} transfers. Pending transfers update automatically.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCcw}
            onClick={() => loadHistory({ quiet: true })}
            disabled={historyRefreshing}
            loading={historyRefreshing}
          >
            Refresh
          </Button>
        </div>

        <div className="investor-token-purchase-history__toolbar investor-token-transfer-history__toolbar">
          <label className="investor-token-purchase-history__search">
            <Search size={16} />
            <span className="sr-only">Search transfer history</span>
            <input
              type="search"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              maxLength={100}
              placeholder="Search transfer or wallet address"
            />
          </label>
          <div className="investor-token-transfer-history__filters">
            <MarketplaceDropdown
              value={historyDirection}
              options={HISTORY_DIRECTION_OPTIONS}
              onChange={setHistoryDirection}
              ariaLabel="Filter transfer history by direction"
              className="investor-token-purchase-history__filter-dropdown"
              menuClassName="investor-token-purchase-history__filter-menu"
              align="end"
              portal
            />
            <MarketplaceDropdown
              value={historyStatus}
              options={HISTORY_STATUS_OPTIONS}
              onChange={setHistoryStatus}
              ariaLabel="Filter transfer history by status"
              className="investor-token-purchase-history__filter-dropdown"
              menuClassName="investor-token-purchase-history__filter-menu"
              align="end"
              portal
            />
          </div>
        </div>

        <div className="investor-token-purchase-history__summary">
          <span>{historyMeta.total} transfer{historyMeta.total === 1 ? '' : 's'}</span>
          {historyHasPending ? <span className="is-live"><Clock3 size={13} /> Pending transfers are updating</span> : null}
        </div>

        {historyError ? (
          <div className="investor-token-purchase-history__message is-error" role="status">
            <Info size={17} />
            <div>
              <strong>Transfer history temporarily unavailable</strong>
              <p>{historyError}</p>
            </div>
            <button type="button" onClick={() => loadHistory({ quiet: true })}>Try again</button>
          </div>
        ) : null}

        {historyLoading && !history.length ? (
          <div className="investor-token-purchase-history__loading" aria-label="Loading transfer history">
            <span /><span /><span />
          </div>
        ) : history.length ? (
          <div className="investor-token-purchase-history__table" role="table" aria-label={`${token.symbol} transfer history`}>
            <div className="investor-token-purchase-history__table-head" role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Direction</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Counterparty</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Transaction</span>
            </div>

            {history.map((row, index) => {
              const rowUid = transferUidOf(row) || `transfer-${index}`;
              const rowStatus = historyStatusMeta(row?.status);
              const direction = transferDirectionOf(row, context.investorWalletAddress);
              const counterparty = counterpartOf(row, context.investorWalletAddress);
              const rowHash = txHashOf(row);
              const rowChainId = row?.chainId || row?.transactionRequest?.chainId || context.chainId || walletGuard.targetChainId;
              const rowExplorerUrl = transactionExplorerUrl(rowHash, rowChainId);
              return (
                <div className="investor-token-purchase-history__row" key={rowUid} role="row">
                  <span className="investor-token-purchase-history__cell" data-label="Date" role="cell">
                    <strong>{formatHistoryDate(row?.completedAt || row?.updatedAt || row?.createdAt || row?.preparedAt)}</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Direction" role="cell">
                    <strong>{direction === 'sent' ? 'Sent' : 'Received'}</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Amount" role="cell">
                    <strong>{formatExactAmount(tokenAmountOf(row)) || '—'} {token.symbol}</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Counterparty" role="cell">
                    <strong title={counterparty || undefined}>{shortAddress(counterparty)}</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Status" role="cell">
                    <span className={`investor-token-purchase-history__badge is-${rowStatus.tone}`}>{rowStatus.label}</span>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Transaction" role="cell">
                    {rowHash && rowExplorerUrl ? (
                      <a href={rowExplorerUrl} target="_blank" rel="noreferrer" className="investor-token-purchase-history__hash" title="View transfer transaction">
                        {shortHash(rowHash)} <ExternalLink size={13} />
                      </a>
                    ) : rowHash ? <strong>{shortHash(rowHash)}</strong> : <span className="investor-token-purchase-history__muted">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="investor-token-purchase-history__empty">
            <History size={24} />
            <strong>{historySearchDebounced || historyStatus !== 'all' || historyDirection !== 'all' ? 'No matching transfers' : 'No transfers yet'}</strong>
            <p>{historySearchDebounced || historyStatus !== 'all' || historyDirection !== 'all' ? 'Try a different search or filter.' : `Your ${token.symbol} sent and received activity will appear here.`}</p>
          </div>
        )}

        <InvestorHistoryPagination
          page={historyCurrentPage}
          totalPages={historyMeta.totalPages}
          onPageChange={setHistoryPage}
          disabled={historyLoading}
          itemLabel="Transfer history"
        />
      </Card>
    </div>
  );
}
