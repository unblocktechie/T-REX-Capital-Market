import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Info,
  RefreshCcw,
  Search,
  Scale,
  ShieldCheck,
  ShoppingCart,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { useNavigate, useParams } from 'react-router-dom';
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
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRegisteredInvestmentAction } from '@/hooks/useRegisteredInvestmentAction';
import { useRegisteredInvestorWalletGuard } from '@/hooks/useRegisteredInvestorWalletGuard';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import {
  clearInvestorTokenPurchaseRecovery,
  loadInvestorTokenPurchaseRecovery,
  saveInvestorTokenPurchaseRecovery,
} from '@/services/investor/investorTokenPurchaseRecoveryStore';
import {
  addInvestorPurchaseTokenToWallet,
  getInvestorPurchaseTokenBalance,
  isInvestorPurchaseWalletRejection,
  submitInvestorPurchasePayment,
  waitForInvestorPurchasePaymentReceipt,
} from '@/services/investor/investorTokenPurchaseTransaction.service';
import { getErrorMessage, sanitizeUserFacingMessage } from '@/utils/error';
import { getWalletErrorMessage } from '@/utils/wallet';
import { getInvestmentActionContext } from '@/utils/investmentPurchase';
import { resolveCurrentTokenPriceExact } from '@/utils/tokenPrice';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const PURCHASE_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  MINT_SUBMITTED: 'MINT_SUBMITTED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
});

const POLL_INTERVAL_MS = 5_000;
const POLL_LONG_RUNNING_MS = 180_000;
const HISTORY_POLL_INTERVAL_MS = 7_000;
const HISTORY_SEARCH_DEBOUNCE_MS = 400;
const HISTORY_LIMIT = 5;

const PURCHASE_HISTORY_FILTERS = Object.freeze([
  { value: 'all', label: 'All statuses', description: 'Show every purchase' },
  { value: PURCHASE_STATUS.PENDING_PAYMENT, label: 'Pending', description: 'Payment is still pending' },
  { value: PURCHASE_STATUS.PAYMENT_CONFIRMED, label: 'Payment Received', description: 'USDT payment received' },
  { value: PURCHASE_STATUS.MINT_SUBMITTED, label: 'Tokens Issued', description: 'Token issuance is in progress' },
  { value: PURCHASE_STATUS.COMPLETED, label: 'Completed', description: 'Purchase finalized' },
  { value: PURCHASE_STATUS.EXPIRED, label: 'Expired', description: 'Checkout expired before payment' },
]);

const PROCESSING_PURCHASE_STATUSES = new Set([
  PURCHASE_STATUS.PENDING_PAYMENT,
  PURCHASE_STATUS.PAYMENT_CONFIRMED,
  PURCHASE_STATUS.MINT_SUBMITTED,
]);

const clean = (value) => String(value ?? '').trim();
const normalizeStatus = (value) => clean(value).toUpperCase();
const validTransactionHash = (value) => /^0x[a-fA-F0-9]{64}$/.test(clean(value));

const purchaseUidOf = (purchase) => clean(purchase?.purchaseUid || purchase?.uid || purchase?.id);
const paymentHashOf = (purchase) => clean(
  purchase?.paymentTxHash
  || purchase?.txHash
  || purchase?.payment?.txHash
  || purchase?.paymentTransaction?.txHash,
);
const mintHashOf = (purchase) => clean(
  // The purchase APIs return the backend-generated mint hash at data.mint.txHash.
  purchase?.mint?.txHash
  || purchase?.mintTxHash
  || purchase?.mintTransaction?.txHash,
);

const synchronizationStatusOf = (purchase) => normalizeStatus(purchase?.synchronization?.status);

const hasPendingTransactionHistory = (purchase) => (
  Array.isArray(purchase?.transactionHistory)
  && purchase.transactionHistory.some((entry) => normalizeStatus(entry?.status) === 'PENDING')
);

const isPurchaseProcessing = (purchase) => (
  PROCESSING_PURCHASE_STATUSES.has(normalizeStatus(purchase?.status))
  || synchronizationStatusOf(purchase) === 'QUEUED'
  || hasPendingTransactionHistory(purchase)
);

const purchaseDataError = (purchase) => {
  const raw = purchase?.error;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    return { message: clean(raw) || 'This purchase needs attention.', code: '' };
  }
  if (typeof raw === 'object') {
    return {
      message: clean(raw.message || raw.errorMessage || raw.detail) || 'This purchase needs attention.',
      code: clean(raw.code || raw.errorCode),
    };
  }
  return { message: clean(raw) || 'This purchase needs attention.', code: '' };
};

const isDefinitiveApiFailure = (error) => {
  if (error?.response?.data?.error !== null && error?.response?.data?.error !== undefined) return true;
  const status = Number(error?.response?.status);
  if (!Number.isFinite(status)) return false;
  if (status < 400 || status >= 500) return false;
  return !new Set([408, 425, 429]).has(status);
};

const backendRequestId = (error) => clean(
  error?.response?.data?.requestId
  || error?.response?.headers?.['x-request-id'],
);

const backendErrorCode = (error) => clean(
  error?.response?.data?.error?.code
  || error?.response?.data?.code,
);

const createCheckoutKey = () => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `checkout-${uuid}`;
};

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

const supportedTokenDecimals = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : 18;
};

const safeParseUnits = (value, decimals) => {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
};

const displayServerAmount = (value, fallback = '—') => {
  const normalized = clean(value);
  return normalized || fallback;
};

const purchaseHistoryStatusMeta = (status) => {
  switch (normalizeStatus(status)) {
    case PURCHASE_STATUS.PENDING_PAYMENT:
      return { label: 'Pending', tone: 'pending', tooltip: '' };
    case PURCHASE_STATUS.PAYMENT_CONFIRMED:
      return {
        label: 'Payment Received',
        tone: 'confirmed',
        tooltip: 'Your USDT payment has been received successfully. Your payment transaction has been recorded and your tokens are being processed.',
      };
    case PURCHASE_STATUS.MINT_SUBMITTED:
      return {
        label: 'Tokens Issued',
        tone: 'minting',
        tooltip: 'Your tokens have been issued to your wallet. You can check your wallet to see your token balance.',
      };
    case PURCHASE_STATUS.COMPLETED:
      return {
        label: 'Completed',
        tone: 'completed',
        tooltip: 'Your purchase is complete. The token transaction has received the required blockchain confirmations and is considered finalized.',
      };
    case PURCHASE_STATUS.EXPIRED:
      return {
        label: 'Expired',
        tone: 'expired',
        tooltip: "We didn't receive a payment within the allowed time, so this purchase has expired. No tokens were issued.",
      };
    case 'PENDING':
      return { label: 'Pending', tone: 'pending', tooltip: '' };
    case 'CONFIRMED':
      return { label: 'Confirmed', tone: 'completed', tooltip: '' };
    case 'FAILED':
      return { label: 'Failed', tone: 'expired', tooltip: '' };
    default:
      return { label: clean(status).replaceAll('_', ' ') || 'Unknown', tone: 'neutral', tooltip: '' };
  }
};

const historyDate = (value, fallback = '—') => {
  const raw = clean(value);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const shortHash = (value) => {
  const hash = clean(value);
  if (!hash) return '—';
  return hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-5)}` : hash;
};

const historyExpirationReason = (row) => sanitizeUserFacingMessage(clean(
  row?.expiration?.reason
  || row?.expirationReason
  || row?.error?.message
  || row?.errorMessage,
));

const historyExpirationReasonLabel = (row) => {
  const reason = historyExpirationReason(row);
  if (!reason) return '—';
  if (reason === 'PAYMENT_NOT_SUBMITTED') return 'Payment not submitted';
  return reason.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
};

const historyHasActiveRows = (rows) => (
  Array.isArray(rows)
  && rows.some((row) => PROCESSING_PURCHASE_STATUSES.has(normalizeStatus(row?.status)))
);

const isPurchaseBlockingNewCheckout = (purchase) => (
  PROCESSING_PURCHASE_STATUSES.has(normalizeStatus(purchase?.status))
);

const isPaymentAcceptedStatus = (purchase) => {
  const status = normalizeStatus(purchase?.status);
  return [
    PURCHASE_STATUS.PAYMENT_CONFIRMED,
    PURCHASE_STATUS.MINT_SUBMITTED,
    PURCHASE_STATUS.COMPLETED,
  ].includes(status);
};

const isPurchaseStateAdvanceResponse = (error) => {
  const code = clean(
    error?.response?.data?.error?.code
    || error?.response?.data?.code,
  ).toUpperCase();
  const message = clean(
    error?.response?.data?.error?.message
    || error?.response?.data?.message
    || error?.message,
  ).toLowerCase();

  return [
    'PURCHASE_STATE_CHANGED',
    'PURCHASE_STATUS_CHANGED',
    'PURCHASE_ALREADY_CONFIRMED',
    'PAYMENT_ALREADY_CONFIRMED',
  ].includes(code) || /purchase changed while payment was being verified|payment (?:is |was )?already confirmed|purchase (?:is |was )?already being finalized/.test(message);
};

export default function PurchaseTokenPage({
  interestUid: interestUidOverride,
  embedded = false,
}) {
  const { interestUid: routeInterestUid } = useParams();
  const interestUid = interestUidOverride || routeInterestUid;
  const navigate = useNavigate();
  const { application, token, loading, error, ready } = useRegisteredInvestmentAction(interestUid);
  const [tokenAmountInput, setTokenAmountInput] = useState('');
  const [purchase, setPurchase] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [broadcastTxHash, setBroadcastTxHash] = useState('');
  const [, setPurchaseError] = useState('');
  const [, setPurchaseErrorCode] = useState('');
  const [, setPurchaseRequestId] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [, setPollingTimedOut] = useState(false);
  const [verificationBlocked, setVerificationBlocked] = useState(false);
  const [paymentReceiptConfirmed, setPaymentReceiptConfirmed] = useState(false);
  const [wasFirstTokenPurchase, setWasFirstTokenPurchase] = useState(false);
  const [addingWalletToken, setAddingWalletToken] = useState(false);
  const [walletTokenAdded, setWalletTokenAdded] = useState(false);
  const [tokenWalletBalanceRaw, setTokenWalletBalanceRaw] = useState(null);
  const [tokenWalletBalanceLoading, setTokenWalletBalanceLoading] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [purchaseHistoryMeta, setPurchaseHistoryMeta] = useState({});
  const [purchaseHistoryPage, setPurchaseHistoryPage] = useState(1);
  const [purchaseHistorySearch, setPurchaseHistorySearch] = useState('');
  const [purchaseHistorySearchDebounced, setPurchaseHistorySearchDebounced] = useState('');
  const [purchaseHistoryStatus, setPurchaseHistoryStatus] = useState('all');
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(false);
  const [purchaseHistoryRefreshing, setPurchaseHistoryRefreshing] = useState(false);
  const [purchaseHistoryError, setPurchaseHistoryError] = useState('');
  const [purchaseHistoryRefreshVersion, setPurchaseHistoryRefreshVersion] = useState(0);
  const [latestPurchase, setLatestPurchase] = useState(null);
  const [purchaseGateTokenUid, setPurchaseGateTokenUid] = useState('');
  const [purchaseGateLoading, setPurchaseGateLoading] = useState(true);
  const [purchaseGateError, setPurchaseGateError] = useState('');
  const [purchaseGateRefreshVersion, setPurchaseGateRefreshVersion] = useState(0);
  const operationLockRef = useRef(false);
  const recoveryLoadKeyRef = useRef('');
  const pollStartedAtRef = useRef({ purchaseUid: '', startedAt: 0 });
  const completedToastRef = useRef('');
  const walletTokenAutoPromptRef = useRef(false);
  const purchaseHistoryRequestRef = useRef({ controller: null, inFlight: false });
  const purchaseHistoryLoadedVersionRef = useRef(0);
  const purchaseGateRequestRef = useRef({ controller: null, inFlight: false });

  useDocumentTitle(
    embedded ? 'Manage Tokens' : token ? `${token.name} · Purchase Token` : 'Purchase Token',
  );

  const applicationRoute = ROUTES.applicationDetail(interestUid);
  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const historyTokenUid = clean(token?.id || token?.tokenUid);
  const preparedInvestorWallet = clean(purchase?.investorWalletAddress) || context.investorWalletAddress;
  const preparedChainId = purchase?.chainId || context.chainId;
  const walletGuard = useRegisteredInvestorWalletGuard(preparedInvestorWallet, preparedChainId);
  const tokenContractAddress = clean(purchase?.tokenAddress) || context.tokenAddress;
  const tokenBalanceChainId = preparedChainId || walletGuard.targetChainId;

  const tokenDecimals = supportedTokenDecimals(token?.decimals);
  const tokenPriceExact = clean(
    purchase?.tokenPriceSnapshot
    || purchase?.tokenPrice
    || purchase?.currentTokenPrice
    || purchase?.pricePerToken
    || resolveCurrentTokenPriceExact(token || {}),
  );
  const tokenPrice = Number(tokenPriceExact);
  const maxTokenBalanceExact = canonicalDecimal(
    token?.maxBalancePerInvestorExact || token?.maxBalancePerInvestor || token?.maxBalance,
  );
  const normalizedTokenAmount = canonicalDecimal(tokenAmountInput);
  const preparedPayment = Number(clean(purchase?.usdtAmount || purchase?.paymentAmount || purchase?.totalUsdtAmount));
  const estimatedPayment = Number.isFinite(preparedPayment) && preparedPayment > 0
    ? preparedPayment
    : Number.isFinite(tokenPrice) && tokenPrice > 0 && Number(normalizedTokenAmount) > 0
      ? Number(normalizedTokenAmount) * tokenPrice
      : 0;
  const topics = token?.eligibility?.topics || [];
  const allRequiredClaimsReady = topics.length
    ? topics.every((topic) => topic.satisfied && !topic.rejected)
    : ready;

  const tokenWalletBalance = useMemo(() => {
    if (typeof tokenWalletBalanceRaw !== 'bigint') return '';
    try {
      return displayServerAmount(formatUnits(tokenWalletBalanceRaw, tokenDecimals), '0');
    } catch {
      return '';
    }
  }, [tokenDecimals, tokenWalletBalanceRaw]);

  const refreshTokenWalletBalance = useCallback(async () => {
    if (!tokenContractAddress || !preparedInvestorWallet || !tokenBalanceChainId) {
      setTokenWalletBalanceRaw(null);
      return;
    }

    setTokenWalletBalanceLoading(true);
    try {
      const balance = await getInvestorPurchaseTokenBalance({
        tokenAddress: tokenContractAddress,
        investorWalletAddress: preparedInvestorWallet,
        chainId: tokenBalanceChainId,
      });
      setTokenWalletBalanceRaw(balance);
    } catch {
      // Balance visibility must never block purchase settlement. If the read-only
      // RPC is temporarily unavailable, keep the summary usable and try again on
      // the next relevant state refresh.
      setTokenWalletBalanceRaw(null);
    } finally {
      setTokenWalletBalanceLoading(false);
    }
  }, [preparedInvestorWallet, tokenBalanceChainId, tokenContractAddress]);

  useEffect(() => {
    void refreshTokenWalletBalance();
  }, [refreshTokenWalletBalance, purchase?.status, purchase?.mint?.txHash]);

  const tokenAmountError = useMemo(() => {
    if (!clean(tokenAmountInput)) return '';
    const normalized = canonicalDecimal(tokenAmountInput);
    if (!normalized || !isPositiveDecimal(normalized)) {
      return 'Enter a token amount greater than zero.';
    }
    if (decimalPlaces(clean(tokenAmountInput)) > tokenDecimals) {
      return `${token?.symbol || 'This token'} supports up to ${tokenDecimals} decimal place${tokenDecimals === 1 ? '' : 's'}.`;
    }

    const requestedRaw = safeParseUnits(normalized, tokenDecimals);
    if (requestedRaw === null || requestedRaw <= 0n) {
      return 'Enter a valid token amount greater than zero.';
    }

    if (maxTokenBalanceExact) {
      const maximumRaw = safeParseUnits(maxTokenBalanceExact, tokenDecimals);
      if (maximumRaw !== null && requestedRaw > maximumRaw) {
        return `You can request up to ${maxTokenBalanceExact} ${token?.symbol || 'tokens'} for this investment.`;
      }
    }
    return '';
  }, [maxTokenBalanceExact, token?.symbol, tokenAmountInput, tokenDecimals]);

  const purchaseUid = purchaseUidOf(purchase) || clean(recovery?.purchaseUid);
  const paymentTxHash = paymentHashOf(purchase) || broadcastTxHash || clean(recovery?.txHash);
  const purchaseStatus = normalizeStatus(purchase?.status);
  const isCompleted = purchaseStatus === PURCHASE_STATUS.COMPLETED;
  const recoveryUncertain = Boolean(
    recovery?.paymentAttemptStarted
    && purchaseUid
    && purchaseStatus === PURCHASE_STATUS.PENDING_PAYMENT
    && !paymentTxHash,
  );
  const explorerUrlFor = useCallback((txHash, chainIdOverride) => {
    if (!validTransactionHash(txHash)) return '';
    const chainId = Number(chainIdOverride || purchase?.chainId || context.chainId);
    const chain = web3Config.supportedChains.find((item) => item.id === chainId);
    const baseUrl = chain?.blockExplorers?.default?.url;
    return baseUrl ? `${baseUrl}/tx/${txHash}` : '';
  }, [context.chainId, purchase?.chainId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPurchaseHistoryPage(1);
      setPurchaseHistorySearchDebounced(clean(purchaseHistorySearch).slice(0, 100));
    }, HISTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [purchaseHistorySearch]);

  const refreshPurchaseHistory = useCallback(() => {
    setPurchaseHistoryRefreshVersion((current) => current + 1);
    setPurchaseGateRefreshVersion((current) => current + 1);
  }, []);

  const loadLatestPurchaseForGate = useCallback(async ({ mode = 'load' } = {}) => {
    if (!historyTokenUid) return;
    if (mode === 'poll' && purchaseGateRequestRef.current.inFlight) return;

    if (mode !== 'poll' && purchaseGateRequestRef.current.controller) {
      purchaseGateRequestRef.current.controller.abort();
    }

    const controller = new AbortController();
    purchaseGateRequestRef.current = { controller, inFlight: true };
    if (mode !== 'poll') setPurchaseGateLoading(true);
    setPurchaseGateError('');

    try {
      const result = await investmentApi.listTokenPurchases(historyTokenUid, {
        page: 1,
        limit: 1,
        search: '',
        status: 'all',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const rows = Array.isArray(result?.data) ? result.data : [];
      setLatestPurchase(rows[0] || null);
      setPurchaseGateTokenUid(historyTokenUid);
    } catch (gateError) {
      if (controller.signal.aborted || gateError?.code === 'ERR_CANCELED' || gateError?.name === 'CanceledError') return;
      setPurchaseGateTokenUid(historyTokenUid);
      setPurchaseGateError(getErrorMessage(gateError, 'Your latest purchase status could not be verified right now.'));
    } finally {
      if (purchaseGateRequestRef.current.controller === controller) {
        purchaseGateRequestRef.current = { controller: null, inFlight: false };
        setPurchaseGateLoading(false);
      }
    }
  }, [historyTokenUid]);

  useEffect(() => {
    if (!ready || !historyTokenUid) return undefined;
    void loadLatestPurchaseForGate({ mode: 'load' });
    return () => {
      purchaseGateRequestRef.current.controller?.abort();
    };
  }, [historyTokenUid, loadLatestPurchaseForGate, purchaseGateRefreshVersion, ready]);

  useEffect(() => {
    if (!ready || !historyTokenUid || !isPurchaseBlockingNewCheckout(latestPurchase)) return undefined;

    const poll = () => {
      if (!document.hidden) void loadLatestPurchaseForGate({ mode: 'poll' });
    };
    const timer = window.setInterval(poll, HISTORY_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [historyTokenUid, latestPurchase, loadLatestPurchaseForGate, ready]);

  const loadPurchaseHistory = useCallback(async ({ mode = 'load' } = {}) => {
    if (!historyTokenUid) return;
    if (mode === 'poll' && purchaseHistoryRequestRef.current.inFlight) return;

    if (mode !== 'poll' && purchaseHistoryRequestRef.current.controller) {
      purchaseHistoryRequestRef.current.controller.abort();
    }

    const controller = new AbortController();
    purchaseHistoryRequestRef.current = { controller, inFlight: true };
    if (mode === 'refresh') setPurchaseHistoryRefreshing(true);
    else if (mode !== 'poll') setPurchaseHistoryLoading(true);
    setPurchaseHistoryError('');

    try {
      const result = await investmentApi.listTokenPurchases(historyTokenUid, {
        page: purchaseHistoryPage,
        limit: HISTORY_LIMIT,
        search: purchaseHistorySearchDebounced,
        status: purchaseHistoryStatus,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPurchaseHistory(Array.isArray(result?.data) ? result.data : []);
      setPurchaseHistoryMeta(result?.meta && typeof result.meta === 'object' ? result.meta : {});
    } catch (historyError) {
      if (controller.signal.aborted || historyError?.code === 'ERR_CANCELED' || historyError?.name === 'CanceledError') return;
      setPurchaseHistoryError(getErrorMessage(historyError, 'Purchase history could not be refreshed right now.'));
    } finally {
      if (purchaseHistoryRequestRef.current.controller === controller) {
        purchaseHistoryRequestRef.current = { controller: null, inFlight: false };
        setPurchaseHistoryLoading(false);
        setPurchaseHistoryRefreshing(false);
      }
    }
  }, [
    historyTokenUid,
    purchaseHistoryPage,
    purchaseHistorySearchDebounced,
    purchaseHistoryStatus,
  ]);

  useEffect(() => {
    if (!ready || !historyTokenUid) return undefined;
    const explicitRefresh = purchaseHistoryLoadedVersionRef.current !== purchaseHistoryRefreshVersion;
    purchaseHistoryLoadedVersionRef.current = purchaseHistoryRefreshVersion;
    void loadPurchaseHistory({ mode: explicitRefresh ? 'refresh' : 'load' });
    return () => {
      purchaseHistoryRequestRef.current.controller?.abort();
    };
  }, [historyTokenUid, loadPurchaseHistory, purchaseHistoryRefreshVersion, ready]);

  useEffect(() => {
    if (!ready || !historyTokenUid || !historyHasActiveRows(purchaseHistory)) return undefined;
    let timer = null;

    const poll = () => {
      if (!document.hidden) void loadPurchaseHistory({ mode: 'poll' });
    };

    timer = window.setInterval(poll, HISTORY_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [historyTokenUid, loadPurchaseHistory, purchaseHistory, ready]);

  const handleHistorySearchChange = (event) => {
    setPurchaseHistorySearch(event.target.value.slice(0, 100));
  };

  const handleHistoryStatusChange = (nextStatus) => {
    setPurchaseHistoryStatus(nextStatus);
    setPurchaseHistoryPage(1);
  };

  const handleHistoryRefresh = () => {
    if (purchaseHistoryRequestRef.current.inFlight) {
      purchaseHistoryRequestRef.current.controller?.abort();
    }
    refreshPurchaseHistory();
  };



  const persistRecovery = useCallback((patch) => {
    const next = saveInvestorTokenPurchaseRecovery(interestUid, patch);
    setRecovery(next);
    return next;
  }, [interestUid]);

  const applyPurchase = useCallback((nextPurchase, fallbackTxHash = '') => {
    if (!nextPurchase || typeof nextPurchase !== 'object') return;
    const stored = loadInvestorTokenPurchaseRecovery(interestUid);
    const nextUid = purchaseUidOf(nextPurchase) || clean(stored?.purchaseUid);
    const nextHash = paymentHashOf(nextPurchase) || clean(fallbackTxHash) || clean(stored?.txHash);
    const nextTokenAmount = clean(nextPurchase.tokenAmount) || clean(stored?.tokenAmount) || normalizedTokenAmount;

    setPurchase((current) => ({
      ...(current || {}),
      ...nextPurchase,
      ...(nextUid ? { purchaseUid: nextUid } : {}),
      ...(nextHash ? { paymentTxHash: nextHash } : {}),
      ...(nextTokenAmount ? { tokenAmount: nextTokenAmount } : {}),
    }));
    if (nextHash) setBroadcastTxHash(nextHash);
    setPurchaseRequestId(clean(nextPurchase.requestId));
    if (nextUid) {
      setLatestPurchase((current) => ({ ...(current || {}), ...nextPurchase, purchaseUid: nextUid }));
      setPurchaseGateTokenUid(clean(token?.id || token?.tokenUid));
      setPurchaseGateError('');
      setPurchaseGateLoading(false);
    }

    const status = normalizeStatus(nextPurchase.status);
    const serverError = purchaseDataError(nextPurchase);

    if (serverError) {
      setPurchaseError(serverError.message);
      setPurchaseErrorCode(serverError.code);
      setVerificationBlocked(true);
    } else if (isPurchaseProcessing(nextPurchase) || status === PURCHASE_STATUS.COMPLETED || status === PURCHASE_STATUS.EXPIRED) {
      // PENDING_PAYMENT, PAYMENT_CONFIRMED, MINT_SUBMITTED, queued synchronization,
      // transaction-history PENDING, and HTTP 202 responses are normal processing states.
      setPurchaseError('');
      setPurchaseErrorCode('');
      setVerificationBlocked(false);
    }

    if (
      status === PURCHASE_STATUS.PAYMENT_CONFIRMED
      || status === PURCHASE_STATUS.MINT_SUBMITTED
      || status === PURCHASE_STATUS.COMPLETED
    ) {
      setPaymentReceiptConfirmed(true);
    }
    if (status === PURCHASE_STATUS.COMPLETED) {
      clearInvestorTokenPurchaseRecovery(interestUid);
      setRecovery(null);
      setPollingTimedOut(false);
      setVerificationBlocked(false);
      setPurchaseError('');
      setPurchaseErrorCode('');
      if (nextUid && completedToastRef.current !== nextUid) {
        completedToastRef.current = nextUid;
        investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
        toast.success('Purchase complete. Your portfolio has been updated.');
      }
      return;
    }

    if (status === PURCHASE_STATUS.EXPIRED) {
      clearInvestorTokenPurchaseRecovery(interestUid);
      setRecovery(null);
      setBroadcastTxHash('');
      setPaymentReceiptConfirmed(false);
      setPollingTimedOut(false);
      setVerificationBlocked(false);
      setPurchaseError('');
      setPurchaseErrorCode('');
      return;
    }

    persistRecovery({
      tokenUid: token?.id || token?.tokenUid || '',
      purchaseUid: nextUid,
      tokenAmount: nextTokenAmount,
      txHash: nextHash,
    });
  }, [interestUid, normalizedTokenAmount, persistRecovery, token?.id, token?.tokenUid]);

  const recordError = useCallback((nextError, fallback) => {
    const message = getErrorMessage(nextError, fallback);
    const code = backendErrorCode(nextError);
    const requestId = backendRequestId(nextError);
    setPurchaseError(message);
    setPurchaseErrorCode(code);
    setPurchaseRequestId(requestId);
    return { message, code, requestId };
  }, []);

  useEffect(() => {
    const tokenUid = clean(token?.id || token?.tokenUid);
    if (!interestUid || !tokenUid) return undefined;
    const loadKey = `${interestUid}:${tokenUid}`;
    if (recoveryLoadKeyRef.current === loadKey) return undefined;
    recoveryLoadKeyRef.current = loadKey;

    const stored = loadInvestorTokenPurchaseRecovery(interestUid);
    if (!stored || (stored.tokenUid && stored.tokenUid !== tokenUid)) {
      if (stored?.tokenUid && stored.tokenUid !== tokenUid) {
        clearInvestorTokenPurchaseRecovery(interestUid);
      }
      setRecovery(null);
      return undefined;
    }

    setRecovery(stored);
    if (stored.txHash) setBroadcastTxHash(stored.txHash);
    if (stored.paymentReceiptConfirmed) setPaymentReceiptConfirmed(true);
    if (stored.hadTokenBalanceBeforePurchase === false) setWasFirstTokenPurchase(true);
    if (!stored.purchaseUid) return undefined;

    let cancelled = false;
    const resume = async () => {
      try {
        // Refresh server state first. A locally stored wallet hash is never shared
        // with the confirm API until its blockchain receipt is successful.
        let next = await investmentApi.getTokenPurchase(stored.purchaseUid);
        if (!cancelled) applyPurchase(next, stored.txHash);

        const nextStatus = normalizeStatus(next?.status);
        const resumeServerError = purchaseDataError(next);
        if (
          !resumeServerError
          && stored.txHash
          && nextStatus === PURCHASE_STATUS.PENDING_PAYMENT
        ) {
          if (!stored.paymentReceiptConfirmed) {
            await waitForInvestorPurchasePaymentReceipt({
              txHash: stored.txHash,
              chainId: next?.chainId || context.chainId,
            });
            if (cancelled) return;
            setPaymentReceiptConfirmed(true);
            persistRecovery({ paymentReceiptConfirmed: true });
          }

          next = await investmentApi.confirmTokenPurchase(stored.purchaseUid, stored.txHash);
          if (!cancelled) applyPurchase(next, stored.txHash);
        }

        // If the page disappeared before a hash was captured, ask backend recovery
        // to reconcile the existing intent before another wallet payment is allowed.
        if (
          !stored.txHash
          && stored.paymentAttemptStarted
          && normalizeStatus(next?.status) === PURCHASE_STATUS.PENDING_PAYMENT
        ) {
          await investmentApi.retryTokenPurchase(stored.purchaseUid);
          refreshPurchaseHistory();
          pollStartedAtRef.current = { purchaseUid: stored.purchaseUid, startedAt: Date.now() };
        }
      } catch (resumeError) {
        if (resumeError?.confirmedRevert) {
          if (!cancelled) {
            setBroadcastTxHash('');
            setPaymentReceiptConfirmed(false);
            persistRecovery({ txHash: '', paymentAttemptStarted: false, paymentReceiptConfirmed: false });
            setPurchase((current) => current ? { ...current, paymentTxHash: '', txHash: '' } : current);
            recordError(resumeError, 'The previous payment did not complete successfully. You can try the payment again.');
          }
          return;
        }

        try {
          const next = await investmentApi.getTokenPurchase(stored.purchaseUid);
          if (!cancelled) {
            applyPurchase(next, stored.txHash);
            if (stored.txHash && !stored.paymentReceiptConfirmed) {
              setPurchaseError('');
              setPurchaseErrorCode('');
            }
          }
        } catch (statusError) {
          if (!cancelled && isDefinitiveApiFailure(statusError)) {
            recordError(statusError, 'We could not refresh this purchase right now. Please try again.');
          }
          // Temporary/network/5xx status failures do not turn an in-progress purchase into an error.
        }
      } finally {
        // Recovery is background-only; Purchase History is the visible lifecycle UI.
      }
    };

    void resume();
    return () => {
      cancelled = true;
    };
  }, [applyPurchase, context.chainId, interestUid, persistRecovery, recordError, refreshPurchaseHistory, token?.id, token?.tokenUid]);

  const shouldPoll = Boolean(
    purchaseUid
    && !isCompleted
    && !verificationBlocked
    && (
      purchaseStatus === PURCHASE_STATUS.PAYMENT_CONFIRMED
      || purchaseStatus === PURCHASE_STATUS.MINT_SUBMITTED
      || (purchaseStatus === PURCHASE_STATUS.PENDING_PAYMENT && (paymentTxHash || recoveryUncertain))
      || synchronizationStatusOf(purchase) === 'QUEUED'
      || hasPendingTransactionHistory(purchase)
    ),
  );

  useEffect(() => {
    if (!shouldPoll) return undefined;

    if (pollStartedAtRef.current.purchaseUid !== purchaseUid) {
      pollStartedAtRef.current = { purchaseUid, startedAt: Date.now() };
    }

    let cancelled = false;
    let timer;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      const elapsed = Date.now() - pollStartedAtRef.current.startedAt;
      if (elapsed >= POLL_LONG_RUNNING_MS) {
        // Keep polling until COMPLETED; this flag only changes the helper copy so a
        // long-running backend verification/mint is never mistaken for a failure.
        setPollingTimedOut(true);
      }

      inFlight = true;
      try {
        let next = await investmentApi.getTokenPurchase(purchaseUid);
        if (cancelled) return;

        let nextStatus = normalizeStatus(next?.status);
        const responseServerError = purchaseDataError(next);
        const receiptAlreadyConfirmed = paymentReceiptConfirmed || recovery?.paymentReceiptConfirmed;
        if (
          !responseServerError
          && nextStatus === PURCHASE_STATUS.PENDING_PAYMENT
          && paymentTxHash
          && !receiptAlreadyConfirmed
        ) {
          try {
            await waitForInvestorPurchasePaymentReceipt({
              txHash: paymentTxHash,
              chainId: next?.chainId || preparedChainId,
              timeout: 1_500,
            });
            if (cancelled) return;
            setPaymentReceiptConfirmed(true);
            persistRecovery({ paymentReceiptConfirmed: true });
            next = await investmentApi.confirmTokenPurchase(purchaseUid, paymentTxHash);
            nextStatus = normalizeStatus(next?.status);
          } catch (receiptError) {
            if (receiptError?.confirmedRevert) {
              setBroadcastTxHash('');
              setPaymentReceiptConfirmed(false);
              persistRecovery({ txHash: '', paymentAttemptStarted: false, paymentReceiptConfirmed: false });
              setPurchase((current) => current ? { ...current, paymentTxHash: '', txHash: '' } : current);
              setPurchaseError('The payment did not complete successfully. You can try the payment again.');
              setPurchaseErrorCode('PAYMENT_REVERTED');
              return;
            }
            // Still pending on-chain. Do not send the hash to the backend yet.
          }
        }

        applyPurchase(next, paymentTxHash);
        const serverError = purchaseDataError(next);
        if (!serverError && (isPurchaseProcessing(next) || nextStatus === PURCHASE_STATUS.COMPLETED)) {
          setPurchaseError('');
          setPurchaseErrorCode('');
        }
        if (nextStatus !== PURCHASE_STATUS.COMPLETED && !serverError) {
          // HTTP 202 and all documented processing states continue through GET polling.
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (pollError) {
        if (cancelled) return;
        if (isDefinitiveApiFailure(pollError)) {
          recordError(pollError, 'We could not continue this purchase. Please check the details and try again.');
          return;
        }
        // Temporary provider/server failures are not purchase failures. Keep polling.
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      } finally {
        inFlight = false;
      }
    };

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [applyPurchase, paymentReceiptConfirmed, paymentTxHash, persistRecovery, preparedChainId, purchaseUid, recordError, recovery?.paymentReceiptConfirmed, shouldPoll]);

  const ensurePaymentIntent = useCallback(async () => {
    const tokenUid = clean(token?.id || token?.tokenUid);
    if (!tokenUid) throw new Error('The token identifier is unavailable. Refresh the page and try again.');
    if (!normalizedTokenAmount || tokenAmountError) {
      throw new Error(tokenAmountError || 'Enter a token amount greater than zero.');
    }

    // Each explicit Purchase click starts from the normal form flow. The backend
    // remains authoritative and may return an already-active purchase when its
    // single-unsettled-purchase rule applies.
    const idempotencyKey = createCheckoutKey();
    clearInvestorTokenPurchaseRecovery(interestUid);
    setRecovery(null);
    persistRecovery({
      tokenUid,
      purchaseUid: '',
      tokenAmount: normalizedTokenAmount,
      idempotencyKey,
      txHash: '',
      paymentAttemptStarted: false,
      paymentReceiptConfirmed: false,
    });

    const prepared = await investmentApi.createTokenPurchase(tokenUid, {
      tokenAmount: normalizedTokenAmount,
      idempotencyKey,
    });
    applyPurchase(prepared);
    refreshPurchaseHistory();
    return prepared;
  }, [applyPurchase, interestUid, normalizedTokenAmount, persistRecovery, refreshPurchaseHistory, token?.id, token?.tokenUid, tokenAmountError]);

  const confirmKnownHash = useCallback(async (currentPurchaseUid, txHash) => {
    if (!currentPurchaseUid || !validTransactionHash(txHash)) return null;
    try {
      // This API is reached only after the frontend has observed a successful
      // blockchain receipt for this exact payment hash.
      const next = await investmentApi.confirmTokenPurchase(currentPurchaseUid, txHash);
      applyPurchase(next, txHash);
      refreshPurchaseHistory();
      const serverError = purchaseDataError(next);
      if (serverError && !isPaymentAcceptedStatus(next)) {
        setVerificationBlocked(true);
        toast.error('Purchase needs attention', { description: serverError.message });
      } else {
        // PAYMENT_CONFIRMED / MINT_SUBMITTED (including HTTP 202) are normal
        // progression states. The GET poll owns the flow from this point until
        // the purchase reaches COMPLETED.
        setVerificationBlocked(false);
        setPurchaseError('');
        setPurchaseErrorCode('');
      }
      return next;
    } catch (confirmError) {
      refreshPurchaseHistory();
      if (isDefinitiveApiFailure(confirmError)) {
        // Confirmation and the purchase worker can advance the same purchase at
        // nearly the same time. If that happens, a stale Confirm response must
        // not be presented as a payment failure. Re-read the authoritative
        // purchase and treat PAYMENT_CONFIRMED/MINT_SUBMITTED/COMPLETED as a
        // successful progression of the existing purchase.
        try {
          const reconciled = await investmentApi.getTokenPurchase(currentPurchaseUid);
          if (!purchaseDataError(reconciled) && isPaymentAcceptedStatus(reconciled)) {
            const reconciledStatus = normalizeStatus(reconciled?.status);
            applyPurchase(reconciled, txHash);
            refreshPurchaseHistory();
            setVerificationBlocked(false);
            setPurchaseError('');
            setPurchaseErrorCode('');
            if (reconciledStatus !== PURCHASE_STATUS.COMPLETED) {
              toast.success('Payment received', {
                description: 'Your payment is confirmed and your purchase is being finalized.',
              });
            }
            return reconciled;
          }
        } catch {
          // If reconciliation cannot be read, fall through to the original
          // verification error so the investor still receives a clear message.
        }

        if (isPurchaseStateAdvanceResponse(confirmError)) {
          setVerificationBlocked(false);
          setPurchaseError('');
          setPurchaseErrorCode('');
          toast.info('Purchase is being finalized', {
            description: 'Your purchase status was updated while payment verification was in progress. We will keep checking automatically.',
          });
          return null;
        }

        const { message } = recordError(confirmError, 'Your payment could not be verified. Please check the details before trying again.');
        setVerificationBlocked(true);
        toast.error('Payment needs attention', { description: message });
        return null;
      }

      // A temporary response (including verification/mint recovery still in progress)
      // is not a failure. The status poll will continue until COMPLETED.
      setPurchaseError('');
      setPurchaseErrorCode('');
      setVerificationBlocked(false);
      return null;
    }
  }, [applyPurchase, recordError, refreshPurchaseHistory]);

  const confirmPaymentAfterSuccessfulReceipt = useCallback(async (currentPurchaseUid, txHash, chainId) => {
    if (!currentPurchaseUid || !validTransactionHash(txHash)) return null;

    try {
      await waitForInvestorPurchasePaymentReceipt({ txHash, chainId });
      setPaymentReceiptConfirmed(true);
      persistRecovery({
        purchaseUid: currentPurchaseUid,
        txHash,
        paymentAttemptStarted: false,
        paymentReceiptConfirmed: true,
      });
      setPurchaseError('');
      setPurchaseErrorCode('');
      toast.success('Payment confirmed on the network. Verifying your purchase now.');
      return await confirmKnownHash(currentPurchaseUid, txHash);
    } catch (receiptError) {
      if (receiptError?.confirmedRevert) {
        setBroadcastTxHash('');
        setPaymentReceiptConfirmed(false);
        persistRecovery({
          purchaseUid: currentPurchaseUid,
          txHash: '',
          paymentAttemptStarted: false,
          paymentReceiptConfirmed: false,
        });
        setPurchase((current) => current ? { ...current, paymentTxHash: '', txHash: '' } : current);
        const message = getErrorMessage(receiptError, 'The payment did not complete successfully. No confirmation was sent to the platform.');
        setPurchaseError(message);
        setPurchaseErrorCode(clean(receiptError?.code));
        toast.error('Payment failed', { description: message });
        return null;
      }

      const message = 'Your payment was sent and is waiting for network confirmation. We will continue checking automatically.';
      setPurchaseError('');
      setPurchaseErrorCode('');
      toast.info('Waiting for network confirmation', { description: message });
      return null;
    }
  }, [confirmKnownHash, persistRecovery]);

  const handlePurchase = async () => {
    if (operationLockRef.current) return;

    const gateMatchesToken = Boolean(historyTokenUid) && purchaseGateTokenUid === historyTokenUid;
    if (purchaseGateLoading || !gateMatchesToken) {
      toast.info('Checking your latest purchase status. Please wait a moment.');
      return;
    }
    if (purchaseGateError) {
      toast.error('Purchase temporarily unavailable', {
        description: 'We could not verify whether your previous purchase has finished. Refresh the purchase history and try again.',
      });
      return;
    }
    if (isPurchaseBlockingNewCheckout(latestPurchase)) {
      toast.info('Your previous purchase is still being finalized.', {
        description: 'You can start another purchase after the current purchase is completed.',
      });
      return;
    }

    if (!walletGuard.ready) {
      toast.error('Connect the investor wallet linked to your profile on the required network to continue.');
      return;
    }
    if (!normalizedTokenAmount || tokenAmountError) {
      toast.error(tokenAmountError || 'Enter a token amount greater than zero.');
      return;
    }

    operationLockRef.current = true;
    setBusyAction('PAYMENT');
    setPurchaseError('');
    setPurchaseErrorCode('');
    setVerificationBlocked(false);

    let prepared;
    try {
      prepared = await ensurePaymentIntent();
    } catch (intentError) {
      const { message } = recordError(intentError, 'We could not prepare this purchase. Please try again.');
      const statusCode = Number(intentError?.response?.status);
      // A definitive validation response means no valid payment intent was created
      // for this attempt, so the investor may correct the amount and retry.
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 409) {
        clearInvestorTokenPurchaseRecovery(interestUid);
        setRecovery(null);
      }
      toast.error('Unable to continue', { description: message });
      setBusyAction('');
      operationLockRef.current = false;
      return;
    }

    const preparedStatus = normalizeStatus(prepared?.status);
    const preparedUid = purchaseUidOf(prepared);
    const recoveredHash = paymentHashOf(prepared);
    const preparedServerError = purchaseDataError(prepared);

    if (preparedServerError) {
      toast.error('Purchase needs attention', { description: preparedServerError.message });
      setBusyAction('');
      operationLockRef.current = false;
      return;
    }

    if (preparedStatus === PURCHASE_STATUS.COMPLETED) {
      setBusyAction('');
      operationLockRef.current = false;
      return;
    }

    if (
      preparedStatus === PURCHASE_STATUS.PAYMENT_CONFIRMED
      || preparedStatus === PURCHASE_STATUS.MINT_SUBMITTED
    ) {
      toast.success('Payment already confirmed', {
        description: 'Your purchase is being finalized. You can start another purchase after it is completed.',
      });
      setBusyAction('');
      operationLockRef.current = false;
      return;
    }

    if (recoveredHash) {
      persistRecovery({ purchaseUid: preparedUid, txHash: recoveredHash });
      setBroadcastTxHash(recoveredHash);
      await confirmPaymentAfterSuccessfulReceipt(preparedUid, recoveredHash, prepared?.chainId || context.chainId);
      setBusyAction('');
      operationLockRef.current = false;
      return;
    }

    try {
      const storedBeforePayment = loadInvestorTokenPurchaseRecovery(interestUid);
      if (typeof storedBeforePayment?.hadTokenBalanceBeforePurchase !== 'boolean') {
        try {
          const currentTokenBalance = await getInvestorPurchaseTokenBalance(prepared);
          const hadTokenBalance = currentTokenBalance > 0n;
          persistRecovery({ hadTokenBalanceBeforePurchase: hadTokenBalance });
          setWasFirstTokenPurchase(!hadTokenBalance);
        } catch {
          // Balance detection is only used to decide whether to offer wallet token
          // tracking after completion. It must never block a valid purchase.
        }
      } else {
        setWasFirstTokenPurchase(storedBeforePayment.hadTokenBalanceBeforePurchase === false);
      }

      // Mark the wallet attempt before opening the provider. If the page closes at
      // the wrong moment, the next visit will reconcile status before allowing a
      // second payment attempt.
      persistRecovery({ purchaseUid: preparedUid, paymentAttemptStarted: true });

      // This is the only point that opens the wallet for a purchase payment. The
      // service consumes only backend-prepared transaction values.
      const txHash = await submitInvestorPurchasePayment({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        preparedPurchase: prepared,
      });

      // Keep the hash locally as soon as MetaMask broadcasts it, but do not share
      // it with the backend yet. The confirm API is called only after a successful
      // blockchain receipt is observed.
      setBroadcastTxHash(txHash);
      setPaymentReceiptConfirmed(false);
      persistRecovery({
        purchaseUid: preparedUid,
        txHash,
        paymentAttemptStarted: false,
        paymentReceiptConfirmed: false,
      });
      setPurchase((current) => ({ ...(current || prepared), paymentTxHash: txHash }));
      toast.info('Payment sent. Waiting for network confirmation.');
      await confirmPaymentAfterSuccessfulReceipt(preparedUid, txHash, prepared?.chainId || context.chainId);
    } catch (walletError) {
      if (isInvestorPurchaseWalletRejection(walletError)) {
        persistRecovery({ purchaseUid: preparedUid, paymentAttemptStarted: false });
        setPurchaseError('');
        setPurchaseErrorCode('');
        toast.info('Transaction cancelled. No payment was sent.');
      } else {
        const safePreBroadcastCodes = new Set(['WALLET_MISMATCH', 'WALLET_ACCOUNT_CHANGED', 'WRONG_WALLET_NETWORK']);
        if (safePreBroadcastCodes.has(clean(walletError?.code))) {
          persistRecovery({ purchaseUid: preparedUid, paymentAttemptStarted: false });
        }
        const message = getWalletErrorMessage(walletError, 'The wallet could not submit this payment. Please try again.');
        setPurchaseError(message);
        setPurchaseErrorCode(clean(walletError?.code));
        toast.error('Unable to submit payment', { description: message });
      }
    } finally {
      setBusyAction('');
      operationLockRef.current = false;
      refreshPurchaseHistory();
    }
  };


  const handleTokenAmountChange = (event) => {
    const normalized = normalizeDecimalInput(event.target.value);
    if (normalized === null) return;

    if ([PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.EXPIRED].includes(purchaseStatus)) {
      setPurchase(null);
      setBroadcastTxHash('');
      setPaymentReceiptConfirmed(false);
      setPollingTimedOut(false);
      setVerificationBlocked(false);
      setPurchaseError('');
      setPurchaseErrorCode('');
    }

    setTokenAmountInput(normalized);
  };

  const handleAddTokenToWallet = useCallback(async ({ automatic = false } = {}) => {
    if (!isCompleted || !wasFirstTokenPurchase || walletTokenAdded || addingWalletToken) return;
    if (!walletGuard.ready) {
      if (!automatic) {
        toast.error('Connect the investor wallet linked to your profile on the required network to add this token.');
      }
      return;
    }
    if (!tokenContractAddress) {
      if (!automatic) toast.error('The token details are temporarily unavailable. Refresh the page and try again.');
      return;
    }

    setAddingWalletToken(true);
    try {
      const added = await addInvestorPurchaseTokenToWallet({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        chainId: purchase?.chainId || context.chainId,
        investorWalletAddress: preparedInvestorWallet,
        tokenAddress: tokenContractAddress,
        tokenSymbol: token?.symbol,
        tokenDecimals,
      });

      if (added) {
        setWalletTokenAdded(true);
        toast.success(`${token?.symbol || 'Token'} added to your wallet.`);
      } else if (!automatic) {
        toast.info('Token was not added. You can try again whenever you are ready.');
      }
    } catch (watchError) {
      if (isInvestorPurchaseWalletRejection(watchError)) {
        if (!automatic) toast.info('Add token request cancelled.');
      } else {
        const message = getErrorMessage(watchError, 'We could not add this token to your wallet right now.');
        if (!automatic) toast.error('Unable to add token', { description: message });
      }
    } finally {
      setAddingWalletToken(false);
    }
  }, [
    addingWalletToken,
    context.chainId,
    isCompleted,
    preparedInvestorWallet,
    purchase?.chainId,
    token?.symbol,
    tokenContractAddress,
    tokenDecimals,
    walletGuard,
    walletTokenAdded,
    wasFirstTokenPurchase,
  ]);

  useEffect(() => {
    if (
      !isCompleted
      || !wasFirstTokenPurchase
      || walletTokenAdded
      || !walletGuard.ready
      || walletTokenAutoPromptRef.current
    ) return;

    walletTokenAutoPromptRef.current = true;
    void handleAddTokenToWallet({ automatic: true });
  }, [handleAddTokenToWallet, isCompleted, walletGuard.ready, walletTokenAdded, wasFirstTokenPurchase]);

  if (loading) {
    return (
      <div className="page-stack investor-token-action-page investor-token-purchase-page">
        <div className="investor-token-action-loading" />
        <div className="investor-token-action-loading investor-token-action-loading--tall" />
      </div>
    );
  }

  if (error || !application || !token) {
    return (
      <TokenActionUnavailable
        title="Purchase Token"
        description="This investment could not be loaded right now."
        onBack={embedded ? undefined : () => navigate(ROUTES.applications)}
      />
    );
  }

  if (!ready) {
    return (
      <TokenActionUnavailable
        title="Purchase Token"
        description="Purchase is not available for this application yet."
        onBack={embedded ? undefined : () => navigate(applicationRoute)}
        backLabel="Back to Application"
      />
    );
  }

  const currentTokenAmount = normalizedTokenAmount;
  const exactTreasury = clean(purchase?.treasuryWalletAddress) || context.issuerTreasuryAddress;
  const paymentContract = clean(purchase?.usdtContractAddress);
  const purchaseGateMatchesToken = Boolean(historyTokenUid) && purchaseGateTokenUid === historyTokenUid;
  const latestPurchaseStatus = normalizeStatus(latestPurchase?.status);
  const purchaseBlockedByPrevious = purchaseGateMatchesToken && isPurchaseBlockingNewCheckout(latestPurchase);
  const purchaseAvailabilityUnverified = purchaseGateLoading || !purchaseGateMatchesToken || Boolean(purchaseGateError);
  const actionLabel = purchaseBlockedByPrevious ? 'Purchase processing' : 'Purchase';
  const actionDisabled = Boolean(busyAction)
    || !walletGuard.ready
    || purchaseAvailabilityUnverified
    || purchaseBlockedByPrevious;
  const historyTotal = Number(
    purchaseHistoryMeta?.total
    ?? purchaseHistoryMeta?.totalCount
    ?? purchaseHistoryMeta?.totalRecords
    ?? purchaseHistoryMeta?.pagination?.total
    ?? purchaseHistory.length,
  ) || 0;
  const historyCurrentPage = Number(
    purchaseHistoryMeta?.page
    ?? purchaseHistoryMeta?.currentPage
    ?? purchaseHistoryMeta?.pagination?.page
    ?? purchaseHistoryPage,
  ) || purchaseHistoryPage;
  const historyTotalPages = Math.max(1, Number(
    purchaseHistoryMeta?.totalPages
    ?? purchaseHistoryMeta?.pages
    ?? purchaseHistoryMeta?.lastPage
    ?? purchaseHistoryMeta?.pagination?.totalPages
    ?? purchaseHistoryMeta?.pagination?.pages
    ?? (historyTotal ? Math.ceil(historyTotal / HISTORY_LIMIT) : 1),
  ) || 1);
  const historyIsActive = historyHasActiveRows(purchaseHistory);

  return (
    <div className="page-stack investor-token-action-page investor-token-purchase-page">
      {!embedded ? (
        <InvestorTokenActionHeader
          eyebrow="Investment action"
          title="Purchase Token"
          description="Choose how many tokens you want to purchase. Your exact payment is calculated securely before your wallet is asked to confirm anything."
        />
      ) : null}

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Eligible to invest" />

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div>
                <span>Verified wallet &amp; payment</span>
                <h2>Your verified investment details</h2>
              </div>
              <ShieldCheck size={19} />
            </div>
            <div className="investor-token-action-address-grid">
              <LockedAddressField label="Primary Investment Wallet" value={preparedInvestorWallet} />
              <LockedAddressField label="Issuer Treasury Wallet" value={exactTreasury} emptyLabel="Treasury wallet unavailable" />
              {paymentContract ? <LockedAddressField label="USDT Contract Address" value={paymentContract} /> : null}
            </div>
            <p className="investor-token-action-helper">
              These details are read from your verified application and the current purchase request. They cannot be edited here.
            </p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div>
                <span>Token amount</span>
                <h2>How many tokens would you like to purchase?</h2>
              </div>
              {maxTokenBalanceExact ? <small>Max holder balance: {maxTokenBalanceExact} {token.symbol}</small> : null}
            </div>
            <label className={`investor-token-action-amount-field ${tokenAmountError ? 'is-invalid' : ''}`}>
              <span className="sr-only">Token amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={tokenAmountInput}
                onChange={handleTokenAmountChange}
                placeholder="0.00"
                aria-invalid={Boolean(tokenAmountError)}
                disabled={Boolean(busyAction)}
                autoComplete="off"
              />
              <strong>{token.symbol}</strong>
            </label>
            {tokenAmountError ? <p className="investor-token-action-field-error">{tokenAmountError}</p> : null}
            {maxTokenBalanceExact ? (
              <p className="investor-token-action-field-hint">
                Your configured holder limit is <strong>{maxTokenBalanceExact} {token.symbol}</strong>. The platform validates the limit again before accepting the purchase.
              </p>
            ) : null}
            <div className="investor-token-action-calculation">
              <span>Estimated payment at current token price</span>
              <strong>
                {estimatedPayment > 0
                  ? `${money.format(estimatedPayment)} ${token.currency || 'USDT'}`
                  : `0 ${token.currency || 'USDT'}`}
              </strong>
            </div>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div>
                <span>Purchase eligibility</span>
                <h2>Investment eligibility</h2>
              </div>
              <CheckCircle2 size={19} />
            </div>
            <div className="investor-token-action-checks">
              <TokenActionCheck
                icon={UserRoundCheck}
                label="Approved investor"
                detail="Your verified profile is approved to hold this token."
                status="Ready"
              />
              <TokenActionCheck
                icon={ShieldCheck}
                label="Verification complete"
                detail={allRequiredClaimsReady ? 'You have completed the required investor verification.' : 'Eligibility is checked again before the purchase is accepted.'}
                status={allRequiredClaimsReady ? 'Ready' : 'Verified at checkout'}
                tone={allRequiredClaimsReady ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={Scale}
                label="Holding limit"
                detail={maxTokenBalanceExact ? `Maximum configured holder balance: ${maxTokenBalanceExact} ${token.symbol}.` : 'The configured holder limit is enforced when the purchase is created.'}
                status="Enforced"
              />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title">
              <span>Order summary</span>
              <ShoppingCart size={18} />
            </div>
            <div className="investor-token-order-row">
              <span>{purchaseUid ? 'Purchase Price' : 'Current Token Price'}</span>
              <strong>{tokenPriceExact ? `$${displayServerAmount(tokenPriceExact)} ${token.currency || 'USDT'}` : '—'}</strong>
            </div>
            <div className="investor-token-order-row investor-token-order-row--primary">
              <span>Tokens to Receive</span>
              <strong>{displayServerAmount(currentTokenAmount, '0')} <small>{token.symbol}</small></strong>
            </div>
            <div className="investor-token-order-row">
              <span>Estimated Payment</span>
              <strong>
                {estimatedPayment > 0
                  ? `$${money.format(estimatedPayment)} ${token.currency || 'USDT'}`
                  : '—'}
              </strong>
            </div>
            <div className="investor-token-order-row">
              <span>Wallet Balance</span>
              <strong>
                {tokenWalletBalanceLoading
                  ? 'Loading…'
                  : tokenWalletBalance
                    ? `${tokenWalletBalance} ${token.symbol || ''}`
                    : `— ${token.symbol || ''}`}
              </strong>
            </div>

            <div className="investor-token-purchase-status is-ready">
              <WalletCards size={18} />
              <div>
                <strong>Payment ready</strong>
                <p>Review the token amount and payment estimate, then choose Purchase. Your registered wallet will show the exact transfer for approval.</p>
              </div>
            </div>

            {!walletGuard.ready ? (
              <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="make this purchase" />
            ) : null}

            <Button
              className="investor-token-order-card__cta"
              icon={ShoppingCart}
              onClick={handlePurchase}
              disabled={actionDisabled}
              loading={Boolean(busyAction)}
            >
              {actionLabel}
            </Button>
            <small className="investor-token-order-card__footnote">
              {!walletGuard.ready
                ? 'Connect the investor wallet linked to your profile on the required network to purchase.'
                : purchaseGateLoading || !purchaseGateMatchesToken
                  ? 'Checking your latest purchase status…'
                  : purchaseGateError
                    ? 'Purchase availability could not be verified. Refresh the purchase history and try again.'
                    : purchaseBlockedByPrevious
                      ? latestPurchaseStatus === PURCHASE_STATUS.PENDING_PAYMENT
                        ? 'Your previous purchase is still awaiting payment confirmation. Another purchase will be available after it finishes.'
                        : latestPurchaseStatus === PURCHASE_STATUS.PAYMENT_CONFIRMED
                          ? 'Your payment has been received. Another purchase will be available after this purchase is completed.'
                          : 'Your tokens are being finalized. Another purchase will be available after this purchase is completed.'
                      : tokenAmountError
                        ? tokenAmountError
                        : busyAction
                          ? 'Your current purchase action is in progress.'
                          : 'Enter a token amount and choose Purchase.'}
            </small>
          </Card>

          <Card className="investor-token-action-side-note">
            <WalletCards size={17} />
            <div>
              <strong>Verified investment wallet</strong>
              <p>Your payment can only be sent from the wallet linked to this registered investment.</p>
            </div>
          </Card>
          <Card className="investor-token-action-side-note">
            <Banknote size={17} />
            <div>
              <strong>Secure settlement</strong>
              <p>Your payment and token delivery are checked before the purchase is shown as complete.</p>
            </div>
          </Card>
        </aside>
      </div>

      {isCompleted && wasFirstTokenPurchase && !walletTokenAdded ? (
        <Card className="investor-token-action-card investor-token-purchase-wallet-token">
          <div className="investor-token-action-card__heading">
            <div>
              <span>Wallet display</span>
              <h2>Add {token.symbol} to your wallet</h2>
            </div>
            <WalletCards size={19} />
          </div>
          <p className="investor-token-action-helper">
            Your first purchase is complete. Add this token to your registered wallet if you want it to appear in your wallet's asset list.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAddTokenToWallet()}
            disabled={!walletGuard.ready || addingWalletToken}
            loading={addingWalletToken}
          >
            Add Token to Wallet
          </Button>
        </Card>
      ) : null}

      <Card className="investor-token-purchase-history">
        <div className="investor-token-purchase-history__header">
          <div className="investor-token-purchase-history__heading">
            <span className="investor-token-purchase-history__icon"><History size={18} /></span>
            <div>
              <h2>Purchase History</h2>
              <p>Track your payment and token delivery for {token.symbol}. Active purchases update automatically.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCcw}
            onClick={handleHistoryRefresh}
            disabled={purchaseHistoryRefreshing}
            loading={purchaseHistoryRefreshing}
          >
            Refresh
          </Button>
        </div>

        <div className="investor-token-purchase-history__toolbar">
          <label className="investor-token-purchase-history__search">
            <Search size={16} />
            <span className="sr-only">Search purchase history</span>
            <input
              type="search"
              value={purchaseHistorySearch}
              onChange={handleHistorySearchChange}
              maxLength={100}
              placeholder="Search purchase ID, amount or transaction ID"
            />
          </label>
          <div className="investor-token-purchase-history__filter">
            <span className="sr-only">Filter purchase history by status</span>
            <MarketplaceDropdown
              value={purchaseHistoryStatus}
              options={PURCHASE_HISTORY_FILTERS}
              onChange={handleHistoryStatusChange}
              ariaLabel="Filter purchase history by status"
              className="investor-token-purchase-history__filter-dropdown"
              menuClassName="investor-token-purchase-history__filter-menu"
              align="end"
              portal
            />
          </div>
        </div>

        <div className="investor-token-purchase-history__summary">
          <span>{historyTotal} purchase{historyTotal === 1 ? '' : 's'}</span>
          {historyIsActive ? <span className="is-live"><Clock3 size={13} /> Active purchases are updating</span> : null}
        </div>

        {purchaseHistoryError ? (
          <div className="investor-token-purchase-history__message is-error" role="status">
            <Info size={17} />
            <div>
              <strong>History temporarily unavailable</strong>
              <p>{purchaseHistoryError}</p>
            </div>
            <button type="button" onClick={handleHistoryRefresh}>Try again</button>
          </div>
        ) : null}

        {purchaseHistoryLoading && !purchaseHistory.length ? (
          <div className="investor-token-purchase-history__loading" aria-label="Loading purchase history">
            <span /><span /><span />
          </div>
        ) : purchaseHistory.length ? (
          <div className="investor-token-purchase-history__table" role="table" aria-label={`${token.symbol} purchase history`}>
            <div className="investor-token-purchase-history__table-head" role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Token amount</span>
              <span role="columnheader">USDT amount</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Payment</span>
              <span role="columnheader">Token Issued</span>
              <span role="columnheader">Expiration reason</span>
            </div>

            {purchaseHistory.map((row, index) => {
              const rowUid = purchaseUidOf(row) || `purchase-${index}`;
              const rowStatus = purchaseHistoryStatusMeta(row?.status);
              const rowPaymentHash = paymentHashOf(row);
              const rowMintHash = mintHashOf(row);
              const rowPaymentUrl = explorerUrlFor(rowPaymentHash, row?.chainId);
              const rowMintUrl = explorerUrlFor(rowMintHash, row?.chainId);
              const expirationReason = historyExpirationReasonLabel(row);

              return (
                <div className="investor-token-purchase-history__row" key={rowUid} role="row">
                  <span className="investor-token-purchase-history__cell" data-label="Date" role="cell">
                    <strong>{historyDate(row?.createdAt || row?.submittedAt || row?.createdDate)}</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Token amount" role="cell">
                    <strong>{displayServerAmount(row?.tokenAmount)} {token.symbol}</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="USDT amount" role="cell">
                    <strong>{displayServerAmount(row?.usdtAmount)} USDT</strong>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Status" role="cell">
                    <span
                      className={`investor-token-purchase-history__badge is-${rowStatus.tone}`}
                      data-tooltip={rowStatus.tooltip || undefined}
                      aria-label={rowStatus.tooltip ? `${rowStatus.label}. ${rowStatus.tooltip}` : rowStatus.label}
                      tabIndex={rowStatus.tooltip ? 0 : undefined}
                    >
                      {rowStatus.label}
                    </span>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Payment" role="cell">
                    {rowPaymentUrl ? (
                      <a href={rowPaymentUrl} target="_blank" rel="noreferrer" className="investor-token-purchase-history__hash" title="View payment transaction">
                        {shortHash(rowPaymentHash)} <ExternalLink size={13} />
                      </a>
                    ) : <span className="investor-token-purchase-history__muted">—</span>}
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Token Issued" role="cell">
                    {rowMintUrl ? (
                      <a href={rowMintUrl} target="_blank" rel="noreferrer" className="investor-token-purchase-history__hash" title="View token issuance transaction">
                        {shortHash(rowMintHash)} <ExternalLink size={13} />
                      </a>
                    ) : <span className="investor-token-purchase-history__muted">—</span>}
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Expiration reason" role="cell">
                    <strong title={historyExpirationReason(row) || undefined}>{expirationReason}</strong>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="investor-token-purchase-history__empty">
            <History size={24} />
            <strong>{purchaseHistorySearchDebounced || purchaseHistoryStatus !== 'all' ? 'No matching purchases' : 'No purchases yet'}</strong>
            <p>{purchaseHistorySearchDebounced || purchaseHistoryStatus !== 'all' ? 'Try a different search or status filter.' : `Your ${token.symbol} purchase activity will appear here after you start a checkout.`}</p>
          </div>
        )}

        <InvestorHistoryPagination
          page={historyCurrentPage}
          totalPages={historyTotalPages}
          onPageChange={setPurchaseHistoryPage}
          disabled={purchaseHistoryLoading}
          itemLabel="Purchase history"
        />
      </Card>
    </div>
  );
}
