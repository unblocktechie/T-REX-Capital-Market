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
  clearObservedWalletTransaction,
  listObservedWalletTransactions,
  saveObservedWalletTransaction,
} from '@/services/investor/observedWalletTransactionStore';
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
  { value: 'all', label: 'All statuses', description: 'Show every token transfer' },
  { value: 'SUBMITTED', label: 'Submitted', description: 'Sent to the network and waiting for confirmation' },
  { value: 'CONFIRMED', label: 'Confirmed', description: 'Confirmed successfully on the blockchain' },
  { value: 'FAILED', label: 'Failed', description: 'The blockchain transaction reverted' },
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

const canonicalTransactionAsTransfer = (row = {}) => {
  const txHash = clean(row?.transactionHash || row?.txHash);
  const canonicalStatus = normalizeStatus(row?.status);
  return {
    ...row,
    canonicalStatus,
    transferUid: txHash || clean(row?.id),
    txHash,
    status: canonicalStatus,
    tokenAmount: clean(row?.tokenAmountFormatted || row?.tokenAmount || row?.amountFormatted),
    senderWalletAddress: clean(row?.fromWallet || row?.from || row?.initiatedByWallet),
    recipientWalletAddress: clean(row?.toWallet || row?.to || row?.recipientWalletAddress),
    completedAt: row?.blockTimestamp || row?.confirmedAt || row?.createdAt,
    createdAt: row?.createdAt || row?.blockTimestamp,
  };
};

const transferUidOf = (transfer) => clean(
  transfer?.transferUid
  || transfer?.uid
  || transfer?.id,
);

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
  || transfer?.recipientAddress,
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
  if (normalizeStatus(status) === 'SUBMITTED') return { label: 'Submitted', tone: 'pending' };
  if (normalizeStatus(status) === 'CONFIRMED') return { label: 'Confirmed', tone: 'success' };
  if (normalizeStatus(status) === 'FAILED') return { label: 'Failed', tone: 'error' };
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

  const completionRef = useRef('');

  useDocumentTitle(
    embedded ? 'Manage Investments' : token ? `${token.name} · Send Tokens` : 'Send Tokens',
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

  const activeTransferUid = transferUidOf(transferRecord);
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
  const serverStatus = normalizeStatus(transferRecord?.status);
  const preparedTransactionRequest = null;
  const knownHash = txHashOf(transferRecord) || txHash;
  const pendingIntent = Boolean(knownHash && (serverStatus === TRANSFER_STATUS.PENDING_TRANSFER || serverStatus === 'SUBMITTED'));
  const hasPreparedIntent = false;
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

  const resetTransferComposer = useCallback(({ clearFields = true } = {}) => {
    setTransferState(TRANSFER_STATE.READY);
    setTransferRecord(null);
    setTxHash('');
    setTransferError('');
    setReplacementAllowed(false);
    if (clearFields) {
      setRecipient('');
      setAmount('');
      setAddressChecked(false);
    }
  }, []);

  const loadHistory = useCallback(async ({ quiet = false } = {}) => {
    const tokenUid = tokenUidOf(token);
    if (!tokenUid) return;
    quiet ? setHistoryRefreshing(true) : setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await investmentApi.listTransactions({
        page: historyPage,
        limit: HISTORY_LIMIT,
        tokenUid,
        type: 'TRANSFER',
        search: historySearchDebounced,
        status: historyStatus,
      });
      let rows = (Array.isArray(response?.data) ? response.data : []).map(canonicalTransactionAsTransfer);
      if (historyDirection !== 'all') {
        rows = rows.filter((row) => transferDirectionOf(row, context.investorWalletAddress) === historyDirection);
      }
      const canonicalHashes = new Set(rows.map((row) => clean(row.txHash).toLowerCase()).filter(Boolean));
      listObservedWalletTransactions({ tokenUid, expectedAction: 'TRANSFER' }).forEach((observed) => {
        if (canonicalHashes.has(clean(observed.txHash).toLowerCase())) clearObservedWalletTransaction(observed);
      });
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
  }, [context.investorWalletAddress, historyDirection, historyPage, historySearchDebounced, historyStatus, token]);

  useEffect(() => {
    const tokenUid = tokenUidOf(token);
    if (!tokenUid) return undefined;
    const observed = listObservedWalletTransactions({ tokenUid, expectedAction: 'TRANSFER', interestUid: resolvedInterestUid })
      .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))[0];
    if (!observed) return undefined;
    setTxHash(observed.txHash);
    setTransferState(TRANSFER_STATE.CONFIRMING);
    setTransferRecord(canonicalTransactionAsTransfer({
      chainId: observed.chainId,
      transactionHash: observed.txHash,
      status: 'SUBMITTED',
      createdAt: observed.observedAt,
    }));

    let active = true;
    const sync = async () => {
      try {
        const next = await investmentApi.confirmObservedTransaction({
          chainId: observed.chainId,
          txHash: observed.txHash,
          tokenUid,
          expectedAction: 'TRANSFER',
        });
        if (!active) return;
        const status = normalizeStatus(next?.status);
        setTransferRecord(canonicalTransactionAsTransfer({ ...next, transactionHash: next?.transactionHash || observed.txHash }));
        if (status === 'CONFIRMED') {
          clearObservedWalletTransaction(observed);
          resetTransferComposer();
          refreshTokenWalletBalance?.();
          investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
          loadHistory({ quiet: true });
        } else if (status === 'FAILED') {
          clearObservedWalletTransaction(observed);
          setTxHash('');
          setTransferState(TRANSFER_STATE.FAILED);
          setTransferError('The blockchain transfer reverted. You can submit a new transfer when ready.');
        }
      } catch {
        // Keep the local hash. The indexer can recover it later without another
        // wallet transaction.
      }
    };
    void sync();
    const onFocus = () => void sync();
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); };
  }, [loadHistory, refreshTokenWalletBalance, resetTransferComposer, resolvedInterestUid, token]);

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
    const hasPendingHistory = history.some((row) => normalizeStatus(row?.canonicalStatus || row?.status) === 'SUBMITTED');
    if (!hasPendingHistory) return undefined;
    const timer = window.setInterval(() => loadHistory({ quiet: true }), HISTORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [history, loadHistory]);

  useEffect(() => {
    if (historyPage > historyMeta.totalPages) setHistoryPage(Math.max(historyMeta.totalPages, 1));
  }, [historyMeta.totalPages, historyPage]);

  useEffect(() => {
    if (!knownHash || ![TRANSFER_STATE.TRANSACTION_SUBMITTED, TRANSFER_STATE.CONFIRMING].includes(transferState)) return;
    const normalizedHash = clean(knownHash).toLowerCase();
    const canonicalMatch = history.find((row) => clean(row?.txHash || row?.transactionHash).toLowerCase() === normalizedHash);
    if (!canonicalMatch) return;

    const status = normalizeStatus(canonicalMatch?.canonicalStatus || canonicalMatch?.status);
    if (status === 'CONFIRMED') {
      clearObservedWalletTransaction({
        chainId: canonicalMatch?.chainId || context.chainId || walletGuard.targetChainId,
        txHash: knownHash,
        expectedAction: 'TRANSFER',
      });
      resetTransferComposer();
      refreshTokenWalletBalance?.();
      investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
    } else if (status === 'FAILED') {
      clearObservedWalletTransaction({
        chainId: canonicalMatch?.chainId || context.chainId || walletGuard.targetChainId,
        txHash: knownHash,
        expectedAction: 'TRANSFER',
      });
      setTransferRecord(canonicalMatch);
      setTransferState(TRANSFER_STATE.FAILED);
      setTxHash('');
      setTransferError('The blockchain transfer reverted. Review the recipient and amount, then send a new transfer when ready.');
    }
  }, [
    context.chainId,
    history,
    knownHash,
    refreshTokenWalletBalance,
    resetTransferComposer,
    transferState,
    walletGuard.targetChainId,
  ]);

  useEffect(() => {
    if (!knownHash || ![TRANSFER_STATE.TRANSACTION_SUBMITTED, TRANSFER_STATE.CONFIRMING].includes(transferState)) return undefined;

    const tokenUid = tokenUidOf(token);
    const chainId = Number(transferRecord?.chainId || context.chainId || walletGuard.targetChainId);
    if (!tokenUid || !chainId || !validTransactionHash(knownHash)) return undefined;

    let cancelled = false;
    let timer = null;
    let inFlight = false;

    const synchronize = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await investmentApi.confirmObservedTransaction({
          chainId,
          txHash: knownHash,
          tokenUid,
          expectedAction: 'TRANSFER',
        });
        if (cancelled) return;
        const status = normalizeStatus(next?.status);
        if (status === 'CONFIRMED') {
          clearObservedWalletTransaction({ chainId, txHash: knownHash, expectedAction: 'TRANSFER' });
          resetTransferComposer();
          refreshTokenWalletBalance?.();
          investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
          loadHistory({ quiet: true });
          return;
        }
        if (status === 'FAILED') {
          clearObservedWalletTransaction({ chainId, txHash: knownHash, expectedAction: 'TRANSFER' });
          setTransferRecord(canonicalTransactionAsTransfer({ ...next, transactionHash: next?.transactionHash || knownHash }));
          setTxHash('');
          setTransferState(TRANSFER_STATE.FAILED);
          setTransferError('The blockchain transfer reverted. Review the details and submit a new transfer when ready.');
          loadHistory({ quiet: true });
          return;
        }
      } catch (syncError) {
        const statusCode = Number(syncError?.response?.status);
        if (!cancelled && statusCode >= 400 && statusCode < 500) {
          clearObservedWalletTransaction({ chainId, txHash: knownHash, expectedAction: 'TRANSFER' });
          setTransferRecord(null);
          setTxHash('');
          setTransferState(TRANSFER_STATE.FAILED);
          setTransferError('This transaction could not be verified for the selected transfer. Review the details and try a new transfer when ready.');
          return;
        }
      } finally {
        inFlight = false;
      }
      if (!cancelled) timer = window.setTimeout(synchronize, HISTORY_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(synchronize, HISTORY_POLL_INTERVAL_MS);
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      void synchronize();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    context.chainId,
    knownHash,
    loadHistory,
    refreshTokenWalletBalance,
    resetTransferComposer,
    token,
    transferRecord?.chainId,
    transferState,
    walletGuard.targetChainId,
  ]);

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
    if (transferBusy) return;
    if (!validateFormForNewIntent()) return;

    const tokenUid = tokenUidOf(token);
    const chainId = Number(context.chainId || walletGuard.targetChainId);
    if (!tokenUid || !context.tokenAddress || !chainId || tokenDecimals === null) {
      toast.error('The investment details are incomplete. Refresh the page and try again.');
      return;
    }

    setTransferState(TRANSFER_STATE.WALLET_CONFIRMATION);
    setTransferError('');
    setReplacementAllowed(false);
    try {
      const hash = await submitInvestorTokenTransfer({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        investorWalletAddress: context.investorWalletAddress,
        chainId,
        tokenAddress: context.tokenAddress,
        recipientWalletAddress: recipient.trim(),
        tokenAmount: normalizedAmount,
        tokenAmountRaw: amountRaw?.toString?.(),
        tokenDecimals,
      });
      if (!validTransactionHash(hash)) throw new Error('Your wallet did not return a valid transaction ID. Check wallet activity before trying again.');

      saveObservedWalletTransaction({
        chainId,
        txHash: hash,
        tokenUid,
        expectedAction: 'TRANSFER',
        interestUid: resolvedInterestUid,
      });
      setTxHash(hash);
      setTransferState(TRANSFER_STATE.CONFIRMING);
      setTransferRecord(canonicalTransactionAsTransfer({
        chainId,
        transactionHash: hash,
        status: 'SUBMITTED',
        tokenAmountFormatted: normalizedAmount,
        fromWallet: context.investorWalletAddress,
        toWallet: recipient.trim(),
        createdAt: new Date().toISOString(),
      }));
      toast.success('Transfer submitted', {
        description: 'Your wallet sent the transfer. No additional wallet action is needed while history synchronizes.',
      });

      try {
        const observed = await investmentApi.confirmObservedTransaction({
          chainId,
          txHash: hash,
          tokenUid,
          expectedAction: 'TRANSFER',
        });
        const status = normalizeStatus(observed?.status);
        setTransferRecord(canonicalTransactionAsTransfer({ ...observed, transactionHash: observed?.transactionHash || hash }));
        if (status === 'CONFIRMED') {
          clearObservedWalletTransaction({ chainId, txHash: hash, expectedAction: 'TRANSFER' });
          resetTransferComposer();
          refreshTokenWalletBalance?.();
          investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
          toast.success('Transfer confirmed', { description: 'The transfer is in your history. You can send another transfer now.' });
        } else if (status === 'FAILED') {
          clearObservedWalletTransaction({ chainId, txHash: hash, expectedAction: 'TRANSFER' });
          setTransferState(TRANSFER_STATE.FAILED);
          setTransferError('The blockchain transfer reverted. You can review the details and submit a new transfer.');
          toast.error('Transfer failed', { description: 'The blockchain transaction reverted. No automatic retry was sent.' });
        }
      } catch (syncError) {
        const statusCode = Number(syncError?.response?.status);
        if (statusCode >= 400 && statusCode < 500) {
          clearObservedWalletTransaction({ chainId, txHash: hash, expectedAction: 'TRANSFER' });
          setTransferRecord(null);
          setTxHash('');
          setTransferState(TRANSFER_STATE.FAILED);
          setTransferError(getErrorMessage(syncError, 'The submitted transaction does not match this transfer.'));
          toast.error('Transaction could not be matched', { description: getErrorMessage(syncError, 'The submitted transaction does not match this transfer.') });
        } else {
          setTransferState(TRANSFER_STATE.CONFIRMING);
          setTransferError('Your transfer is on the blockchain and history is still synchronizing. Do not send it again.');
          toast.info('Transfer sent — history is still syncing', { description: 'The backend/indexer can recover this transaction automatically.' });
        }
      }
      loadHistory({ quiet: true });
    } catch (sendError) {
      if (isInvestorTokenTransferWalletRejection(sendError)) {
        setTransferState(TRANSFER_STATE.CANCELLED);
        setTransferError('');
        toast.info('Wallet request cancelled. No transfer was submitted.');
      } else {
        setTransferState(TRANSFER_STATE.FAILED);
        const message = getErrorMessage(sendError, 'The wallet could not submit this transfer.');
        setTransferError(message);
        toast.error('Unable to send', { description: message });
      }
    }
  };

  const handleRetryVerification = async () => {
    if (!knownHash || retryingVerification) return;
    const tokenUid = tokenUidOf(token);
    const chainId = Number(context.chainId || walletGuard.targetChainId);
    if (!tokenUid || !chainId) return;
    setRetryingVerification(true);
    try {
      const next = await investmentApi.confirmObservedTransaction({
        chainId,
        txHash: knownHash,
        tokenUid,
        expectedAction: 'TRANSFER',
      });
      const status = normalizeStatus(next?.status);
      setTransferRecord(canonicalTransactionAsTransfer({ ...next, transactionHash: next?.transactionHash || knownHash }));
      if (status === 'CONFIRMED') {
        clearObservedWalletTransaction({ chainId, txHash: knownHash, expectedAction: 'TRANSFER' });
        resetTransferComposer();
      } else if (status === 'FAILED') {
        clearObservedWalletTransaction({ chainId, txHash: knownHash, expectedAction: 'TRANSFER' });
        setTxHash('');
        setTransferState(TRANSFER_STATE.FAILED);
        setTransferError('The blockchain transfer reverted.');
      } else {
        setTransferState(TRANSFER_STATE.CONFIRMING);
        setTransferError('The transaction is submitted and is still waiting for canonical confirmation. No new wallet action is required.');
      }
      loadHistory({ quiet: true });
    } catch (retryError) {
      const statusCode = Number(retryError?.response?.status);
      if (statusCode >= 400 && statusCode < 500) {
        clearObservedWalletTransaction({ chainId, txHash: knownHash, expectedAction: 'TRANSFER' });
        setTransferRecord(null);
        setTxHash('');
        setTransferState(TRANSFER_STATE.FAILED);
        setTransferError('This transaction could not be verified for the selected transfer. You can submit a new transfer when ready.');
      } else {
        setTransferError('The transaction is already submitted, but synchronization is temporarily unavailable. Do not send it again.');
        toast.info('Still synchronizing', { description: 'No new wallet transaction is required.' });
      }
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
          title="Send your investment"
          description="Send units to another approved investor. We check the recipient before your wallet asks you to confirm."
        />
      ) : null}

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Approved investor" />

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div><span>From</span><h2>Your registered investment wallet</h2></div>
              <WalletCards size={19} />
            </div>
            <LockedAddressField label="Registered investment wallet" value={context.investorWalletAddress} />
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div><span>Recipient</span><h2>Who are you sending to?</h2></div>
              <Send size={19} />
            </div>
            <div className="investor-token-action-recipient-row">
              <label className={`investor-token-action-text-field ${addressChecked && !recipientError ? 'is-checked' : ''} ${recipientError ? 'is-invalid' : ''} ${formLocked ? 'is-locked' : ''}`}>
                <span className="sr-only">Recipient wallet address</span>
                <input
                  value={recipient}
                  onChange={handleRecipientChange}
                  placeholder="Recipient investment wallet (0x…)"
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
                Check recipient
              </Button>
            </div>
            {recipientError ? <p className="investor-token-action-field-error">{recipientError}</p> : null}
            <p className="investor-token-action-helper">Enter the recipient’s approved investment wallet. We check that they can receive this asset before you continue.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div><span>Amount</span><h2>How many units would you like to send?</h2></div>
              <small>
                {tokenWalletBalanceLoading
                  ? 'You can send up to: Loading…'
                  : balanceAvailable
                    ? `You can send up to: ${tokenWalletBalance} ${token.symbol}`
                    : 'Your available amount will be checked'}
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
            <p className="investor-token-action-field-hint">Enter the number of units to send. We check your available balance again before your wallet asks you to confirm.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading"><div><span>Before you send</span><h2>We check these automatically</h2></div><ShieldCheck size={19} /></div>
            <div className="investor-token-action-checks">
              <TokenActionCheck
                icon={UserRoundCheck}
                label="Recipient wallet"
                detail="We first check that the wallet address is valid."
                status={addressChecked && !recipientError ? 'Ready' : 'Check needed'}
                tone={addressChecked && !recipientError ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={WalletCards}
                label="Amount available"
                detail="We make sure you have enough available units to send."
                status={amountWithinBalance ? 'Ready' : 'Check needed'}
                tone={amountWithinBalance ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={ShieldCheck}
                label="Recipient eligibility"
                detail="We confirm the recipient is approved and that the transfer follows the investment rules."
                status={pendingIntent || transferCompleted ? 'Ready' : 'Checked when you send'}
                tone={pendingIntent || transferCompleted ? 'success' : 'neutral'}
              />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title"><span>Send summary</span><Send size={18} /></div>
            <div className="investor-token-order-row"><span>Amount to send</span><strong>{formattedAmount ? `${formattedAmount} ${token.symbol}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>{activeTransferUid ? 'Price used' : 'Current price per unit'}</span><strong>{transferPriceExact ? `${formatExactAmount(transferPriceExact)} ${token.currency || 'USDT'}` : '—'}</strong></div>
            <div className="investor-token-order-row investor-token-order-row--primary"><span>Estimated value</span><strong>{estimatedTransferValue === null ? '—' : `${estimatedTransferValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token.currency || 'USDT'}`}</strong></div>
            <div className="investor-token-order-row"><span>Recipient</span><strong className="investor-token-order-address">{recipient || 'Not entered'}</strong></div>
            <div className="investor-token-order-row"><span>Network</span><strong>{walletGuard.targetNetworkLabel}</strong></div>
            <div className="investor-token-order-row">
              <span>Your current holding</span>
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
                <span>Confirmation reference</span>
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

            <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="send this investment" />
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
              <h2>Send history</h2>
              <p>See what you sent or received and whether each transfer is complete.</p>
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
              placeholder="Search by reference or wallet"
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
              const rowChainId = row?.chainId || context.chainId || walletGuard.targetChainId;
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
