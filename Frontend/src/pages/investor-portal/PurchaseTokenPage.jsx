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
import { env } from '@/config/env';
import {
  InvestorTokenActionHeader,
  InvestorTokenIdentityCard,
  LockedAddressField,
  RegisteredInvestorWalletGate,
  TokenActionCheck,
  TokenActionUnavailable,
} from '@/components/investor-marketplace/InvestorTokenActionPrimitives';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { InvestmentJourneyTracker } from '@/components/application-history/InvestmentJourneyTracker';
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
  clearObservedWalletTransaction,
  listObservedWalletTransactions,
  saveObservedWalletTransaction,
} from '@/services/investor/observedWalletTransactionStore';
import { quotePlatformPurchase } from '@/services/blockchain/trexPlatformController.service';
import {
  addInvestorPurchaseTokenToWallet,
  approveInvestorUsdtSpending,
  getInvestorPurchaseTokenBalance,
  getInvestorUsdtSpendingApproval,
  isInvestorPurchaseWalletRejection,
  submitInvestorPurchasePayment,
} from '@/services/investor/investorTokenPurchaseTransaction.service';
import { getErrorMessage, sanitizeUserFacingMessage } from '@/utils/error';
import { getWalletErrorMessage } from '@/utils/wallet';
import { getInvestmentActionContext } from '@/utils/investmentPurchase';
import { getInvestmentJourney } from '@/utils/investmentJourney';
import { resolveCurrentTokenPriceExact } from '@/utils/tokenPrice';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const PURCHASE_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  MINT_SUBMITTED: 'MINT_SUBMITTED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
});

const HISTORY_POLL_INTERVAL_MS = 7_000;
const HISTORY_SEARCH_DEBOUNCE_MS = 400;
const HISTORY_LIMIT = 5;

const PURCHASE_HISTORY_FILTERS = Object.freeze([
  { value: 'all', label: 'All statuses', description: 'Show every investment record' },
  { value: 'SUBMITTED', label: 'Submitted', description: 'Submitted and waiting for confirmation' },
  { value: 'CONFIRMED', label: 'Confirmed', description: 'Completed and recorded successfully' },
  { value: 'FAILED', label: 'Failed', description: 'The investment could not be completed' },
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

const canonicalTransactionAsPurchase = (row = {}) => {
  const canonicalStatus = normalizeStatus(row?.status);
  const legacyStatus = canonicalStatus === 'CONFIRMED'
    ? PURCHASE_STATUS.COMPLETED
    : canonicalStatus === 'FAILED'
      ? PURCHASE_STATUS.EXPIRED
      : PURCHASE_STATUS.PENDING_PAYMENT;
  const txHash = clean(row?.transactionHash || row?.txHash);
  return {
    ...row,
    canonicalStatus,
    status: legacyStatus,
    purchaseUid: txHash || clean(row?.id),
    paymentTxHash: txHash,
    txHash,
    tokenAmount: clean(row?.tokenAmountFormatted || row?.tokenAmount || row?.amountFormatted),
    usdtAmount: clean(row?.usdtAmountFormatted || row?.usdtAmount || row?.paymentAmountFormatted),
    tokenPriceSnapshot: clean(row?.priceFormatted || row?.tokenPriceFormatted || row?.price),
    createdAt: row?.blockTimestamp || row?.createdAt || row?.timestamp,
    chainId: row?.chainId,
  };
};

const purchaseHistoryStatusMeta = (status, canonicalStatus = '') => {
  switch (normalizeStatus(canonicalStatus || status)) {
    case 'SUBMITTED':
      return { label: 'Submitted', tone: 'pending', tooltip: 'Your investment was submitted. No additional action is needed while it is being confirmed.' };
    case 'CONFIRMED':
      return { label: 'Confirmed', tone: 'confirmed', tooltip: 'This investment was confirmed successfully and added to your records.' };
    case 'FAILED':
      return { label: 'Failed', tone: 'expired', tooltip: 'The investment could not be completed. You may start a new investment when you are ready.' };
    case PURCHASE_STATUS.PENDING_PAYMENT:
      return { label: 'Pending', tone: 'pending', tooltip: '' };
    case PURCHASE_STATUS.PAYMENT_CONFIRMED:
      return {
        label: 'Payment Received',
        tone: 'confirmed',
        tooltip: 'Your USDT payment was received successfully. Your investment record is being updated.',
      };
    case PURCHASE_STATUS.MINT_SUBMITTED:
      return {
        label: 'Tokens Issued',
        tone: 'minting',
        tooltip: 'Your investment units have been issued to your Privy secure account. Your balance will update shortly.',
      };
    case PURCHASE_STATUS.COMPLETED:
      return {
        label: 'Completed',
        tone: 'completed',
        tooltip: 'Your investment is complete and the final confirmation has been recorded.',
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

const historyHasActiveRows = (rows) => (
  Array.isArray(rows)
  && rows.some((row) => normalizeStatus(row?.canonicalStatus) === 'SUBMITTED')
);

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
  const [broadcastTxHash, setBroadcastTxHash] = useState('');
  const [, setPurchaseError] = useState('');
  const [, setPurchaseErrorCode] = useState('');
  const [, setPurchaseRequestId] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [, setPollingTimedOut] = useState(false);
  const [verificationBlocked, setVerificationBlocked] = useState(false);
  const [wasFirstTokenPurchase, setWasFirstTokenPurchase] = useState(false);
  const [addingWalletToken, setAddingWalletToken] = useState(false);
  const [walletTokenAdded, setWalletTokenAdded] = useState(false);
  const [tokenWalletBalanceRaw, setTokenWalletBalanceRaw] = useState(null);
  const [tokenWalletBalanceLoading, setTokenWalletBalanceLoading] = useState(false);
  const [usdtSpendingApproved, setUsdtSpendingApproved] = useState(false);
  const [usdtApprovalLoading, setUsdtApprovalLoading] = useState(true);
  const [usdtApprovalError, setUsdtApprovalError] = useState('');
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
  const [platformQuote, setPlatformQuote] = useState(null);
  const [platformQuoteLoading, setPlatformQuoteLoading] = useState(false);
  const [platformQuoteError, setPlatformQuoteError] = useState('');
  const operationLockRef = useRef(false);
  const completedToastRef = useRef('');
  const walletTokenAutoPromptRef = useRef(false);
  const purchaseHistoryRequestRef = useRef({ controller: null, inFlight: false });
  const purchaseHistoryLoadedVersionRef = useRef(0);
  const usdtApprovalRequestRef = useRef(0);

  useDocumentTitle(
    embedded ? 'Manage Investments' : token ? `${token.name} · Purchase Token` : 'Purchase Token',
  );

  const applicationRoute = ROUTES.applicationDetail(interestUid);
  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const historyTokenUid = clean(token?.id || token?.tokenUid);
  useEffect(() => {
    if (!historyTokenUid) return undefined;
    const observed = listObservedWalletTransactions({
      tokenUid: historyTokenUid,
      expectedAction: 'INVEST',
      interestUid,
    }).sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))[0];
    if (!observed) return undefined;
    setBroadcastTxHash(observed.txHash);
    setPurchase(canonicalTransactionAsPurchase({
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
          tokenUid: historyTokenUid,
          expectedAction: 'INVEST',
        });
        if (!active) return;
        const status = normalizeStatus(next?.status);
        setPurchase(canonicalTransactionAsPurchase({ ...next, transactionHash: next?.transactionHash || observed.txHash }));
        if (status === 'CONFIRMED' || status === 'FAILED') {
          clearObservedWalletTransaction(observed);
          setBroadcastTxHash('');
          if (status === 'CONFIRMED') investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
        }
        setPurchaseHistoryRefreshVersion((value) => value + 1);
      } catch {
        // Backend/indexer synchronization is best effort. The locally observed
        // hash prevents accidental resubmission and can be recovered later.
      }
    };
    void sync();
    const onFocus = () => void sync();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [historyTokenUid, interestUid]);
  const preparedInvestorWallet = clean(purchase?.investorWalletAddress) || context.investorWalletAddress;
  const preparedChainId = purchase?.chainId || context.chainId;
  const walletGuard = useRegisteredInvestorWalletGuard(preparedInvestorWallet, preparedChainId);
  const tokenContractAddress = clean(purchase?.tokenAddress) || context.tokenAddress;
  const tokenBalanceChainId = preparedChainId || walletGuard.targetChainId;

  const tokenDecimals = supportedTokenDecimals(token?.decimals);
  const maxTokenBalanceExact = canonicalDecimal(
    token?.maxBalancePerInvestorExact || token?.maxBalancePerInvestor || token?.maxBalance,
  );
  const normalizedTokenAmount = canonicalDecimal(tokenAmountInput);
  const activePurchasePrice = clean(
    purchase?.tokenPriceSnapshot
    || purchase?.tokenPrice
    || purchase?.currentTokenPrice
    || purchase?.pricePerToken,
  );
  const tokenPriceExact = activePurchasePrice
    || clean(platformQuote?.priceFormatted)
    || resolveCurrentTokenPriceExact(token || {});
  const tokenPrice = Number(tokenPriceExact);
  const preparedPayment = Number(clean(purchase?.usdtAmount || purchase?.paymentAmount || purchase?.totalUsdtAmount));
  const quotedPayment = Number(clean(platformQuote?.paymentAmountFormatted));
  const estimatedPayment = Number.isFinite(preparedPayment) && preparedPayment > 0
    ? preparedPayment
    : Number.isFinite(quotedPayment) && quotedPayment > 0
      ? quotedPayment
      : Number.isFinite(tokenPrice) && tokenPrice > 0 && Number(normalizedTokenAmount) > 0
        ? Number(normalizedTokenAmount) * tokenPrice
        : 0;
  const requiredPaymentAmountRaw = clean(
    purchase?.usdtAmountRaw
    || purchase?.paymentAmountRaw
    || purchase?.totalUsdtAmountRaw
    || platformQuote?.paymentAmount?.toString?.(),
  );
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

  const refreshUsdtSpendingApproval = useCallback(async ({ silent = false } = {}) => {
    const investorWalletAddress = clean(preparedInvestorWallet);
    const chainId = preparedChainId || walletGuard.targetChainId;
    const requestId = usdtApprovalRequestRef.current + 1;
    usdtApprovalRequestRef.current = requestId;

    if (!investorWalletAddress || !chainId) {
      setUsdtSpendingApproved(false);
      setUsdtApprovalLoading(false);
      setUsdtApprovalError('Your USDT payment permission cannot be checked until your Privy secure account is ready.');
      return false;
    }

    if (!silent) setUsdtApprovalLoading(true);
    setUsdtApprovalError('');
    try {
      const approval = await getInvestorUsdtSpendingApproval({
        investorWalletAddress,
        chainId,
        // If the purchase amount is known, any existing allowance that covers
        // this exact purchase is sufficient. We only ask for a new approval
        // when the current allowance is actually too small.
        requiredPaymentAmountRaw: requiredPaymentAmountRaw || undefined,
      });
      if (usdtApprovalRequestRef.current !== requestId) return Boolean(approval?.spendingApproved);
      const approved = Boolean(approval?.spendingApproved);
      setUsdtSpendingApproved(approved);
      return approved;
    } catch (approvalError) {
      if (usdtApprovalRequestRef.current !== requestId) return false;
      setUsdtSpendingApproved(false);
      setUsdtApprovalError(getErrorMessage(approvalError, 'We could not check your USDT payment permission. Please try again.'));
      return false;
    } finally {
      if (usdtApprovalRequestRef.current === requestId) setUsdtApprovalLoading(false);
    }
  }, [preparedChainId, preparedInvestorWallet, requiredPaymentAmountRaw, walletGuard.targetChainId]);

  useEffect(() => {
    void refreshUsdtSpendingApproval();
  }, [refreshUsdtSpendingApproval]);

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

  useEffect(() => {
    if (!tokenContractAddress || !tokenBalanceChainId || !normalizedTokenAmount || tokenAmountError) {
      setPlatformQuote(null);
      setPlatformQuoteError('');
      setPlatformQuoteLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPlatformQuoteLoading(true);
      quotePlatformPurchase({
        chainId: tokenBalanceChainId,
        tokenAddress: tokenContractAddress,
        tokenAmount: normalizedTokenAmount,
      })
        .then((quote) => {
          if (cancelled) return;
          setPlatformQuote(quote);
          setPlatformQuoteError('');
        })
        .catch((quoteError) => {
          if (cancelled) return;
          setPlatformQuote(null);
          setPlatformQuoteError(getErrorMessage(quoteError, 'The live purchase price is temporarily unavailable.'));
        })
        .finally(() => {
          if (!cancelled) setPlatformQuoteLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedTokenAmount, purchase, tokenAmountError, tokenBalanceChainId, tokenContractAddress]);

  const purchaseUid = purchaseUidOf(purchase);
  const paymentTxHash = paymentHashOf(purchase) || broadcastTxHash;
  const purchaseStatus = normalizeStatus(purchase?.status);
  const isCompleted = purchaseStatus === PURCHASE_STATUS.COMPLETED;
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
  }, []);

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
      const result = await investmentApi.listTransactions({
        page: purchaseHistoryPage,
        limit: HISTORY_LIMIT,
        tokenUid: historyTokenUid,
        type: 'INVEST',
        search: purchaseHistorySearchDebounced,
        status: purchaseHistoryStatus,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const rows = (Array.isArray(result?.data) ? result.data : []).map(canonicalTransactionAsPurchase);
      setPurchaseHistory(rows);
      const canonicalHashes = new Set(rows.map((row) => clean(row.paymentTxHash).toLowerCase()).filter(Boolean));
      listObservedWalletTransactions({ tokenUid: historyTokenUid, expectedAction: 'INVEST' }).forEach((observed) => {
        if (canonicalHashes.has(clean(observed.txHash).toLowerCase())) {
          clearObservedWalletTransaction(observed);
        }
      });
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
    const txHash = clean(broadcastTxHash || paymentHashOf(purchase));
    const chainId = Number(purchase?.chainId || context.chainId || walletGuard.targetChainId);
    if (!historyTokenUid || !validTransactionHash(txHash) || !chainId || normalizeStatus(purchase?.canonicalStatus) !== 'SUBMITTED') return undefined;

    let cancelled = false;
    let timer = null;
    let inFlight = false;

    const sync = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const observed = await investmentApi.confirmObservedTransaction({
          chainId,
          txHash,
          tokenUid: historyTokenUid,
          expectedAction: 'INVEST',
        });
        if (cancelled) return;
        const status = normalizeStatus(observed?.status);
        if (status === 'CONFIRMED' || status === 'FAILED') {
          clearObservedWalletTransaction({ chainId, txHash, expectedAction: 'INVEST' });
          setBroadcastTxHash('');
          setPurchase(canonicalTransactionAsPurchase({ ...observed, transactionHash: observed?.transactionHash || txHash }));
          setPurchaseHistoryRefreshVersion((value) => value + 1);
          if (status === 'CONFIRMED') investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
          return;
        }
      } catch (syncError) {
        const statusCode = Number(syncError?.response?.status);
        if (!cancelled && statusCode >= 400 && statusCode < 500) {
          clearObservedWalletTransaction({ chainId, txHash, expectedAction: 'INVEST' });
          setBroadcastTxHash('');
          setPurchase(canonicalTransactionAsPurchase({ chainId, transactionHash: txHash, status: 'FAILED', createdAt: new Date().toISOString() }));
          return;
        }
      } finally {
        inFlight = false;
      }
      if (!cancelled) timer = window.setTimeout(sync, HISTORY_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(sync, HISTORY_POLL_INTERVAL_MS);
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      void sync();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    broadcastTxHash,
    context.chainId,
    historyTokenUid,
    purchase?.canonicalStatus,
    purchase?.chainId,
    purchase?.paymentTxHash,
    walletGuard.targetChainId,
  ]);

  useEffect(() => {
    const currentHash = clean(broadcastTxHash || paymentHashOf(purchase)).toLowerCase();
    if (!currentHash || normalizeStatus(purchase?.canonicalStatus) !== 'SUBMITTED') return;

    const canonicalMatch = purchaseHistory.find((row) => (
      clean(paymentHashOf(row)).toLowerCase() === currentHash
    ));
    if (!canonicalMatch) return;

    const canonicalStatus = normalizeStatus(canonicalMatch?.canonicalStatus || canonicalMatch?.status);
    if (canonicalStatus !== 'CONFIRMED' && canonicalStatus !== 'FAILED') return;

    setPurchase(canonicalMatch);
    setBroadcastTxHash('');
    clearObservedWalletTransaction({
      chainId: canonicalMatch?.chainId || purchase?.chainId || context.chainId,
      txHash: currentHash,
      expectedAction: 'INVEST',
    });

    if (canonicalStatus === 'CONFIRMED') {
      setPurchaseError('');
      setPurchaseErrorCode('');
      investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
    }
  }, [
    broadcastTxHash,
    context.chainId,
    purchase,
    purchaseHistory,
  ]);

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



  const handleApproveUsdtSpending = async () => {
    if (operationLockRef.current) return;
    if (!walletGuard.ready) {
      toast.error('Your Privy secure account needs attention. Open it from the header and follow the prompt to continue.');
      return;
    }
    if (usdtApprovalLoading) {
      toast.info('Checking your existing USDT payment permission. Please wait a moment.');
      return;
    }
    if (usdtSpendingApproved) {
      toast.success('Your USDT payment permission is already active. You can continue to review your investment.');
      return;
    }

    operationLockRef.current = true;
    setBusyAction('APPROVAL');
    setUsdtApprovalError('');

    try {
      const approval = await approveInvestorUsdtSpending({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        investorWalletAddress: preparedInvestorWallet,
        chainId: preparedChainId || walletGuard.targetChainId,
        onStep: ({ stage }) => {
          if (stage === 'approval-signature') {
            toast.info('Allow USDT payments', {
              id: 'purchase-usdt-approval-step',
              description: 'This one-time permission lets you make investments using USDT. It does not make an investment by itself.',
            });
          } else if (stage === 'approval-confirming') {
            toast.info('Payment permission submitted', {
              id: 'purchase-usdt-approval-step',
              description: 'Waiting for your payment permission to be confirmed.',
            });
          }
        },
      });

      const approved = Boolean(approval?.spendingApproved) || await refreshUsdtSpendingApproval({ silent: true });
      if (!approved) {
        throw new Error('Your USDT payment permission was submitted but could not be confirmed. Refresh and try again.');
      }

      setUsdtSpendingApproved(true);
      setUsdtApprovalError('');
      toast.success('USDT payments allowed', {
        id: 'purchase-usdt-approval-step',
        description: approval?.alreadyApproved
          ? 'Your USDT payment permission is already active. You can continue to review your investment.'
          : 'Your payment permission is active. You can now review and confirm investments using USDT while this permission remains sufficient.',
      });
    } catch (approvalError) {
      if (isInvestorPurchaseWalletRejection(approvalError)) {
        toast.info('Payment permission cancelled. No investment was submitted.');
      } else {
        const message = getWalletErrorMessage(approvalError, 'Your Privy secure account could not confirm the USDT payment permission. Please try again.');
        setUsdtApprovalError(message);
        toast.error('Unable to allow USDT payments', { description: message });
      }
    } finally {
      setBusyAction('');
      operationLockRef.current = false;
    }
  };

  const handlePurchase = async () => {
    if (operationLockRef.current) return;
    if (!walletGuard.ready) {
      toast.error('Your Privy secure account needs attention. Open it from the header and follow the prompt to continue.');
      return;
    }
    if (usdtApprovalLoading) {
      toast.info('Checking your USDT payment permission. Please wait a moment.');
      return;
    }
    if (!usdtSpendingApproved) {
      toast.info('USDT payment permission is required', {
        description: 'Choose Allow payments first. This one-time permission lets you make investments using USDT. You will always review and confirm an investment before funds are used.',
      });
      return;
    }
    if (!normalizedTokenAmount || tokenAmountError) {
      toast.error(tokenAmountError || 'Enter a token amount greater than zero.');
      return;
    }
    if (platformQuoteLoading) {
      toast.info('Checking the latest investment price. Please wait a moment.');
      return;
    }
    if (platformQuoteError || !platformQuote) {
      toast.error('Investment temporarily unavailable', { description: platformQuoteError || 'The current investment price could not be confirmed.' });
      return;
    }

    const tokenUid = historyTokenUid;
    const chainId = Number(tokenBalanceChainId || walletGuard.targetChainId);
    if (!tokenUid || !tokenContractAddress || !chainId) {
      toast.error('Investment details are incomplete. Refresh the page and try again.');
      return;
    }

    operationLockRef.current = true;
    setBusyAction('PAYMENT');
    setPurchaseError('');
    setPurchaseErrorCode('');
    setVerificationBlocked(false);

    try {
      try {
        const currentTokenBalance = await getInvestorPurchaseTokenBalance({
          tokenAddress: tokenContractAddress,
          investorWalletAddress: preparedInvestorWallet,
          chainId,
        });
        setWasFirstTokenPurchase(currentTokenBalance === 0n);
      } catch {
        // Wallet token tracking is optional and never blocks the investment.
      }

      const result = await submitInvestorPurchasePayment({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        investorWalletAddress: preparedInvestorWallet,
        chainId,
        tokenAddress: tokenContractAddress,
        tokenAmount: normalizedTokenAmount,
        tokenAmountRaw: platformQuote?.tokenAmountRaw?.toString?.(),
        expectedPaymentAmountRaw: platformQuote?.paymentAmount?.toString?.(),
        onStep: ({ stage }) => {
          if (stage === 'purchase-signature') {
            toast.info('Review and confirm your investment', {
              id: 'purchase-platform-step',
              description: 'Confirm securely with Privy to submit this investment. Review the amount before you confirm.',
            });
          }
        },
      });

      const txHash = clean(result?.txHash);
      if (!validTransactionHash(txHash)) throw new Error('We did not receive a valid confirmation ID. Check your Privy account details before trying again.');

      // Persist before contacting the backend. Backend availability must never be
      // a prerequisite for, or cause a retry of, this wallet transaction.
      saveObservedWalletTransaction({
        chainId,
        txHash,
        tokenUid,
        expectedAction: 'INVEST',
        interestUid,
      });
      setBroadcastTxHash(txHash);
      setPurchase(canonicalTransactionAsPurchase({
        chainId,
        transactionHash: txHash,
        status: 'SUBMITTED',
        tokenAmountFormatted: result?.quote?.tokenAmount || normalizedTokenAmount,
        usdtAmountFormatted: result?.quote?.paymentAmountFormatted || platformQuote?.paymentAmountFormatted,
        priceFormatted: result?.quote?.priceFormatted || platformQuote?.priceFormatted,
        createdAt: new Date().toISOString(),
      }));
      toast.success('Investment submitted', {
        description: 'Your investment was submitted. No additional action is needed while the confirmation is completed.',
      });

      try {
        const observed = await investmentApi.confirmObservedTransaction({
          chainId,
          txHash,
          tokenUid,
          expectedAction: 'INVEST',
        });
        const status = normalizeStatus(observed?.status);
        if (status === 'CONFIRMED') {
          clearObservedWalletTransaction({ chainId, txHash, expectedAction: 'INVEST' });
          setBroadcastTxHash('');
          setPurchase(canonicalTransactionAsPurchase({ ...observed, transactionHash: observed?.transactionHash || txHash }));
          investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
          toast.success('Investment confirmed', { description: 'Your investment was confirmed and added to your history.' });
        } else if (status === 'FAILED') {
          clearObservedWalletTransaction({ chainId, txHash, expectedAction: 'INVEST' });
          setBroadcastTxHash('');
          setPurchase(canonicalTransactionAsPurchase({ ...observed, transactionHash: observed?.transactionHash || txHash }));
          toast.error('Investment failed', { description: 'The investment could not be completed. No automatic retry was sent.' });
        }
      } catch (syncError) {
        const statusCode = Number(syncError?.response?.status);
        if (statusCode >= 400 && statusCode < 500) {
          clearObservedWalletTransaction({ chainId, txHash, expectedAction: 'INVEST' });
          setBroadcastTxHash('');
          setPurchase(canonicalTransactionAsPurchase({
            chainId,
            transactionHash: txHash,
            status: 'FAILED',
            createdAt: new Date().toISOString(),
          }));
          toast.error('Investment could not be matched', {
            description: sanitizeUserFacingMessage(getErrorMessage(syncError, 'The submitted confirmation does not match this investment.')),
          });
        } else {
          toast.info('Investment submitted — history is updating', {
            description: 'Your investment was submitted successfully. History will update automatically; do not submit it again.',
          });
        }
      }
      refreshPurchaseHistory();
    } catch (walletError) {
      if (isInvestorPurchaseWalletRejection(walletError)) {
        toast.info('Investment cancelled. No investment was submitted.');
      } else if (clean(walletError?.code) === 'PAYMENT_APPROVAL_REQUIRED') {
        setUsdtSpendingApproved(false);
        setUsdtApprovalError('Your current USDT allowance is no longer enough for this investment.');
        toast.error('USDT payment permission required', {
          description: 'Allow USDT payments, then review your investment again.',
        });
      } else {
        const message = getWalletErrorMessage(walletError, 'Your Privy secure account could not submit this investment. Please try again.');
        setPurchaseError(message);
        setPurchaseErrorCode(clean(walletError?.code));
        toast.error('Unable to submit investment', { description: message });
      }
    } finally {
      setBusyAction('');
      operationLockRef.current = false;
    }
  };


  const handleTokenAmountChange = (event) => {
    const normalized = normalizeDecimalInput(event.target.value);
    if (normalized === null) return;

    if ([PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.EXPIRED].includes(purchaseStatus)) {
      setPurchase(null);
      setBroadcastTxHash('');
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
        toast.error('Open the Privy secure account linked to your profile before adding this asset to your Privy wallet display.');
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
        toast.success(`${token?.symbol || 'Asset'} added to your Privy wallet display.`);
      } else if (!automatic) {
        toast.info('Token was not added. You can try again whenever you are ready.');
      }
    } catch (watchError) {
      if (isInvestorPurchaseWalletRejection(watchError)) {
        if (!automatic) toast.info('Add token request cancelled.');
      } else {
        const message = getErrorMessage(watchError, 'We could not add this asset to your Privy wallet display right now.');
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
        title="Make an Investment"
        description="This investment could not be loaded right now."
        onBack={embedded ? undefined : () => navigate(ROUTES.applications)}
      />
    );
  }

  if (!ready) {
    return (
      <TokenActionUnavailable
        title="Make an Investment"
        description="Investment is not available for this application yet."
        onBack={embedded ? undefined : () => navigate(applicationRoute)}
        backLabel="Back to Application"
      />
    );
  }

  const currentTokenAmount = normalizedTokenAmount;
  const exactTreasury = clean(purchase?.treasuryWalletAddress) || context.issuerTreasuryAddress;
  const paymentContract = clean(purchase?.usdtContractAddress) || env.trex.paymentToken;
  const purchaseBlockedByPrevious = normalizeStatus(purchase?.canonicalStatus) === 'SUBMITTED';
  const purchaseAvailabilityUnverified = false;
  const actionLabel = usdtSpendingApproved ? 'Review investment' : 'Allow payments';
  const approvalActionDisabled = Boolean(busyAction)
    || !walletGuard.ready
    || usdtApprovalLoading
    || usdtSpendingApproved;
  const actionDisabled = Boolean(busyAction)
    || !walletGuard.ready
    || usdtApprovalLoading
    || !usdtSpendingApproved
    || !normalizedTokenAmount
    || Boolean(tokenAmountError)
    || platformQuoteLoading
    || Boolean(platformQuoteError)
    || purchaseAvailabilityUnverified
    || purchaseBlockedByPrevious;
  const primaryActionDisabled = usdtSpendingApproved ? actionDisabled : approvalActionDisabled;
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
  const purchaseJourney = getInvestmentJourney({
    status: 'ready_to_invest',
    viewerRole: 'investor',
    purchaseReady: true,
  });

  return (
    <div className="page-stack investor-token-action-page investor-token-purchase-page">
      {!embedded ? (
        <>
          <InvestorTokenActionHeader
            eyebrow="Ready to invest"
            title="Invest"
            description="Choose how many units you want to buy. We will show the estimated USDT cost before you confirm securely with Privy."
          />
          <InvestmentJourneyTracker journey={purchaseJourney} />
        </>
      ) : null}

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Eligible to invest" />

          <Card className="investor-token-action-card investor-token-action-card--setup">
            <div className="investor-token-action-card__heading">
              <div>
                <span>Payment setup</span>
                <h2>Your Privy secure account will be used</h2>
              </div>
              <ShieldCheck size={19} />
            </div>
            <p className="investor-token-action-helper investor-token-action-helper--prominent">
              You will pay with USDT from your Privy secure account. Funds are used only after you review and confirm the investment.
            </p>
            <details className="investor-technical-details investor-token-technical-details">
              <summary>View account &amp; payment details</summary>
              <div className="investor-token-action-address-grid">
                <LockedAddressField label="Your Privy secure account" value={preparedInvestorWallet} />
                <LockedAddressField label="Issuer payment account" value={exactTreasury} emptyLabel="Issuer payment account unavailable" />
                {paymentContract ? <LockedAddressField label="USDT contract" value={paymentContract} /> : null}
              </div>
              <p>These values come from your approved application and cannot be edited here.</p>
            </details>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div>
                <span>Investment amount</span>
                <h2>How many units would you like to buy?</h2>
              </div>
              {maxTokenBalanceExact ? <small>Maximum you can hold: {maxTokenBalanceExact} {token.symbol}</small> : null}
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
                disabled={Boolean(busyAction) || purchaseBlockedByPrevious}
                autoComplete="off"
              />
              <strong>{token.symbol}</strong>
            </label>
            {tokenAmountError ? <p className="investor-token-action-field-error">{tokenAmountError}</p> : null}
            {maxTokenBalanceExact ? (
              <p className="investor-token-action-field-hint">
                You can hold up to <strong>{maxTokenBalanceExact} {token.symbol}</strong> in total. We check this limit automatically before your investment is accepted.
              </p>
            ) : null}
            <div className="investor-token-action-calculation">
              <span>Estimated USDT cost</span>
              <strong>
                {estimatedPayment > 0
                  ? `${money.format(estimatedPayment)} ${token.currency || 'USDT'}`
                  : `0 ${token.currency || 'USDT'}`}
              </strong>
            </div>
            {platformQuoteLoading ? <p className="investor-token-action-field-hint">Checking the latest price…</p> : null}
            {platformQuoteError ? <p className="investor-token-action-field-error" role="alert">{platformQuoteError}</p> : null}
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div>
                <span>Before you invest</span>
                <h2>Your checks are ready</h2>
              </div>
              <CheckCircle2 size={19} />
            </div>
            <div className="investor-token-action-checks">
              <TokenActionCheck
                icon={UserRoundCheck}
                label="Issuer approval"
                detail="The issuer has approved you to hold this investment."
                status="Ready"
              />
              <TokenActionCheck
                icon={ShieldCheck}
                label="Required checks"
                detail={allRequiredClaimsReady ? 'Your required identity and eligibility checks are complete.' : 'Your eligibility is checked again before the investment is accepted.'}
                status={allRequiredClaimsReady ? 'Ready' : 'Checked before investing'}
                tone={allRequiredClaimsReady ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={Scale}
                label="Maximum holding"
                detail={maxTokenBalanceExact ? `You can hold up to ${maxTokenBalanceExact} ${token.symbol} in total.` : 'Your maximum allowed holding is checked automatically.'}
                status="Enforced"
              />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title">
              <span>Investment summary</span>
              <ShoppingCart size={18} />
            </div>
            <div className="investor-token-order-row">
              <span>Price per unit</span>
              <strong>{tokenPriceExact ? `$${displayServerAmount(tokenPriceExact)} ${token.currency || 'USDT'}` : '—'}</strong>
            </div>
            <div className="investor-token-order-row investor-token-order-row--primary">
              <span>You will receive</span>
              <strong>{displayServerAmount(currentTokenAmount, '0')} <small>{token.symbol}</small></strong>
            </div>
            <div className="investor-token-order-row">
              <span>Estimated USDT cost</span>
              <strong>
                {estimatedPayment > 0
                  ? `$${money.format(estimatedPayment)} ${token.currency || 'USDT'}`
                  : '—'}
              </strong>
            </div>
            <div className="investor-token-order-row">
              <span>You currently hold</span>
              <strong>
                {tokenWalletBalanceLoading
                  ? 'Loading…'
                  : tokenWalletBalance
                    ? `${tokenWalletBalance} ${token.symbol || ''}`
                    : `— ${token.symbol || ''}`}
              </strong>
            </div>

            {!walletGuard.ready ? (
              <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="make this investment" />
            ) : null}

            <div className="investor-token-payment-flow investor-token-payment-flow--single" aria-label="Investment action">
              <div className="investor-token-payment-flow__intro">
                <strong>{usdtSpendingApproved ? 'Ready to invest' : 'Allow USDT payments for investments'}</strong>
                <span>
                  {usdtSpendingApproved
                    ? 'Your USDT payment permission is already active. Enter the amount you want to buy and review your investment.'
                    : 'This one-time permission lets you make investments using USDT. You will always review and confirm an investment before funds are used.'}
                </span>
              </div>

              <section className="investor-token-payment-step is-current">
                <div className="investor-token-payment-step__top">
                  <span className="investor-token-payment-step__number" aria-hidden="true">
                    {usdtSpendingApproved ? <ShoppingCart size={16} /> : <ShieldCheck size={16} />}
                  </span>
                  <div className="investor-token-payment-step__heading">
                    <small>{usdtSpendingApproved ? 'Investment' : 'One-time setup'}</small>
                    <strong>{usdtSpendingApproved ? 'Review investment' : 'Payment permission'}</strong>
                  </div>
                  <span className={`investor-token-payment-step__status ${usdtApprovalError && !usdtSpendingApproved ? 'is-attention' : ''}`}>
                    {usdtApprovalLoading
                      ? 'Checking…'
                      : usdtSpendingApproved
                        ? purchaseBlockedByPrevious
                          ? 'Confirming current investment'
                          : 'Ready'
                        : usdtApprovalError
                          ? 'Needs attention'
                          : 'Approval required'}
                  </span>
                  <details className="investor-token-payment-step__help">
                    <summary aria-label={usdtSpendingApproved ? 'About investing' : 'About USDT payment permission'} title="About this action">
                      <Info size={15} />
                    </summary>
                    <div className="investor-token-payment-step__tooltip" role="note">
                      <strong>{usdtSpendingApproved ? 'What happens when I invest?' : 'What does approval mean?'}</strong>
                      {usdtSpendingApproved ? (
                        <>
                          <p>Your Privy secure account lets you review and confirm the investment securely.</p>
                          <p>After this investment is confirmed, you can use Review investment again for another investment.</p>
                        </>
                      ) : (
                        <>
                          <p>This permission does not make an investment or move USDT by itself. It only allows USDT to be used after you review and confirm an investment.</p>
                          <p>The permission can be reused while it remains sufficient, so you do not need to allow payments again for every investment.</p>
                        </>
                      )}
                    </div>
                  </details>
                </div>

                <p className="investor-token-payment-step__copy">
                  {usdtSpendingApproved
                    ? purchaseBlockedByPrevious
                      ? 'Your current investment is being confirmed. As soon as it completes, Review investment becomes available again automatically.'
                      : 'Review the amount and estimated cost, then choose Review investment. Confirm securely with Privy before the investment is submitted.'
                    : 'Choose Allow payments and confirm the permission with Privy. After it is confirmed, this button automatically changes to Review investment.'}
                </p>

                {usdtApprovalError && !usdtSpendingApproved ? (
                  <p className="investor-token-payment-step__error" role="alert">{usdtApprovalError}</p>
                ) : null}

                <Button
                  className="investor-token-order-card__cta investor-token-payment-flow__primary-cta"
                  icon={usdtSpendingApproved ? ShoppingCart : ShieldCheck}
                  onClick={usdtSpendingApproved ? handlePurchase : handleApproveUsdtSpending}
                  disabled={primaryActionDisabled}
                  loading={busyAction === (usdtSpendingApproved ? 'PAYMENT' : 'APPROVAL')}
                >
                  {actionLabel}
                </Button>

                <small className="investor-token-order-card__footnote">
                  {!walletGuard.ready
                    ? 'Your Privy secure account needs attention. Open it from the header and follow the prompt to continue.'
                    : usdtApprovalLoading
                      ? 'Checking your current USDT payment permission…'
                      : !usdtSpendingApproved
                        ? usdtApprovalError || 'Allow USDT payments once to enable investments.'
                        : purchaseBlockedByPrevious
                          ? 'Your submitted investment is still being confirmed. No new action is needed until it completes.'
                          : tokenAmountError
                            ? tokenAmountError
                            : !normalizedTokenAmount
                              ? 'Enter the number of units you want to buy.'
                              : platformQuoteLoading
                                ? 'Checking the latest investment price…'
                                : platformQuoteError
                                  ? platformQuoteError
                                  : busyAction
                                    ? 'Your current secure confirmation is in progress.'
                                    : 'Choose Review investment, then confirm securely with Privy.'}
                </small>
              </section>
            </div>
          </Card>

          <Card className="investor-token-action-side-note">
            <WalletCards size={17} />
            <div>
              <strong>Your Privy secure account protects this action</strong>
              <p>Only the Privy secure account linked to your approved profile can confirm this investment.</p>
            </div>
          </Card>
          <Card className="investor-token-action-side-note">
            <Banknote size={17} />
            <div>
              <strong>You will see when it is complete</strong>
              <p>The investment is complete only after it is confirmed and recorded in your activity history.</p>
            </div>
          </Card>
        </aside>
      </div>

      {isCompleted && wasFirstTokenPurchase && !walletTokenAdded ? (
        <Card className="investor-token-action-card investor-token-purchase-wallet-token">
          <div className="investor-token-action-card__heading">
            <div>
              <span>Privy wallet display</span>
              <h2>Add {token.symbol} to your Privy wallet</h2>
            </div>
            <WalletCards size={19} />
          </div>
          <p className="investor-token-action-helper">
            Your first purchase is complete. You can add this asset to your Privy wallet if you want it to appear in the wallet's asset list.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAddTokenToWallet()}
            disabled={!walletGuard.ready || addingWalletToken}
            loading={addingWalletToken}
          >
            Add to Privy wallet
          </Button>
        </Card>
      ) : null}

      <Card className="investor-token-purchase-history investor-token-purchase-history--investments">
        <div className="investor-token-purchase-history__header">
          <div className="investor-token-purchase-history__heading">
            <span className="investor-token-purchase-history__icon"><History size={18} /></span>
            <div>
              <h2>Investment history</h2>
              <p>Track your confirmed investments for {token.symbol}. Submitted records update automatically.</p>
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
            <span className="sr-only">Search investment history</span>
            <input
              type="search"
              value={purchaseHistorySearch}
              onChange={handleHistorySearchChange}
              maxLength={100}
              placeholder="Search purchase ID, amount or confirmation ID"
            />
          </label>
          <div className="investor-token-purchase-history__filter">
            <span className="sr-only">Filter investment history by status</span>
            <MarketplaceDropdown
              value={purchaseHistoryStatus}
              options={PURCHASE_HISTORY_FILTERS}
              onChange={handleHistoryStatusChange}
              ariaLabel="Filter investment history by status"
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
          <div className="investor-token-purchase-history__loading" aria-label="Loading investment history">
            <span /><span /><span />
          </div>
        ) : purchaseHistory.length ? (
          <div className="investor-token-purchase-history__table" role="table" aria-label={`${token.symbol} investment history`}>
            <div className="investor-token-purchase-history__table-head" role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Token amount</span>
              <span role="columnheader">USDT amount</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Payment</span>
            </div>

            {purchaseHistory.map((row, index) => {
              const rowUid = purchaseUidOf(row) || `purchase-${index}`;
              const rowStatus = purchaseHistoryStatusMeta(row?.status, row?.canonicalStatus);
              const rowPaymentHash = paymentHashOf(row);
              const rowPaymentUrl = explorerUrlFor(rowPaymentHash, row?.chainId);

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
                      <a href={rowPaymentUrl} target="_blank" rel="noreferrer" className="investor-token-purchase-history__hash" title="View payment details">
                        {shortHash(rowPaymentHash)} <ExternalLink size={13} />
                      </a>
                    ) : <span className="investor-token-purchase-history__muted">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="investor-token-purchase-history__empty">
            <History size={24} />
            <strong>{purchaseHistorySearchDebounced || purchaseHistoryStatus !== 'all' ? 'No matching purchases' : 'No purchases yet'}</strong>
            <p>{purchaseHistorySearchDebounced || purchaseHistoryStatus !== 'all' ? 'Try a different search or status filter.' : `Your ${token.symbol} investment records will appear here after you submit an investment.`}</p>
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
