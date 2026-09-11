import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MoreVertical,
  XCircle,
  ExternalLink,
  History,
  Info,
  RefreshCcw,
  RotateCcw,
  Search,
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
  TokenActionUnavailable,
} from '@/components/investor-marketplace/InvestorTokenActionPrimitives';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorTokenWalletBalance } from '@/hooks/useInvestorTokenWalletBalance';
import { useRegisteredInvestmentAction } from '@/hooks/useRegisteredInvestmentAction';
import { useRegisteredInvestorWalletGuard } from '@/hooks/useRegisteredInvestorWalletGuard';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import {
  isInvestorRedemptionWalletRejection,
  signInvestorTokenRedemptionAuthorization,
} from '@/services/investor/investorTokenRedemptionAuthorization.service';
import {
  clearInvestorTokenRedemptionRecovery,
  loadInvestorTokenRedemptionRecovery,
  saveInvestorTokenRedemptionRecovery,
} from '@/services/investor/investorTokenRedemptionRecoveryStore';
import { createLocalId } from '@/utils/createLocalId';
import { getApiFieldErrors, getErrorMessage, sanitizeUserFacingMessage } from '@/utils/error';
import { getInvestmentActionContext } from '@/utils/investmentPurchase';
import { resolveCurrentTokenPriceExact } from '@/utils/tokenPrice';
import { transactionExplorerName, transactionExplorerUrl } from '@/utils/blockExplorer';
import { redemptionRejectionReason } from '@/utils/issuerRedemption';

const POLL_INTERVAL_MS = 7_000;
const MAX_POLL_INTERVAL_MS = 60_000;
const HISTORY_SEARCH_DEBOUNCE_MS = 400;
const HISTORY_LIMIT = 5;
const DEFAULT_REQUIRED_CONFIRMATIONS = 12;
const FINALIZING_REDEMPTION_CONFIRMATIONS = DEFAULT_REQUIRED_CONFIRMATIONS * 2;
const REDEMPTION_HISTORY_FILTERS = Object.freeze([
  { value: 'all', label: 'All statuses', description: 'Show every redemption' },
  { value: 'PENDING_INVESTOR_AUTHORIZATION', label: 'Action Required', description: 'Please confirm your redemption request to continue.' },
  { value: 'PENDING_ISSUER_APPROVAL', label: 'Awaiting Approval', description: 'Your redemption request has been submitted and is waiting for approval.' },
  { value: 'TOKENS_LOCKED', label: 'Payment in Progress', description: 'Your redemption is approved and the payment process is underway.' },
  { value: 'PAYMENT_SUBMITTED', label: 'Finalizing payment', description: 'Your payment is being finalized. No action is required from you.' },
  { value: 'BURN_SUBMITTED', label: 'Finalizing Redemption', description: 'Your redemption is being finalized. No action is required from you.' },
  { value: 'COMPLETED', label: 'Completed', description: 'Your redemption has been completed successfully.' },
  { value: 'ISSUER_REJECTED', label: 'Rejected', description: 'Your redemption request was not approved.' },
  { value: 'CANCELLATION_PENDING', label: 'Cancelling', description: 'Your cancellation request is being processed.' },
  { value: 'CANCELLED', label: 'Cancelled', description: 'Your redemption request has been cancelled.' },
  { value: 'EXPIRED', label: 'Expired', description: 'This redemption request expired before it was completed. You can submit a new request.' },
  { value: 'MANUAL_REVIEW', label: 'Under Review', description: 'Your redemption requires additional review. No action is required from you at this time.' },
]);
const TERMINAL_REDEMPTION_STATUSES = new Set([
  'COMPLETED',
  'ISSUER_REJECTED',
  'CANCELLED',
  'EXPIRED',
]);
const CANCELLABLE_REDEMPTION_STATUSES = new Set([
  'PENDING_INVESTOR_AUTHORIZATION',
  'PENDING_ISSUER_APPROVAL',
  'ISSUER_APPROVED',
  'TOKEN_LOCK_SUBMITTED',
  'TOKENS_LOCKED',
]);
const CONFIRMATION_WAITING_REDEMPTION_STATUSES = new Set([
  'ISSUER_APPROVED',
  'TOKEN_LOCK_SUBMITTED',
  'TOKENS_LOCKED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'BURN_SUBMITTED',
  'BURN_CONFIRMED',
  'UNLOCK_SUBMITTED',
]);

const clean = (value) => String(value ?? '').trim();
const normalizeStatus = (value) => clean(value).toUpperCase();
const redemptionUidOf = (value) => clean(value?.redemptionUid || value?.uid || value?.id);

const supportedTokenDecimals = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : 18;
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

const safeParseUnits = (value, decimals) => {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
};

const formatExactTokenAmount = (value, fallback = '—') => {
  const normalized = canonicalDecimal(value);
  if (!normalized) return fallback;
  const [whole, fraction] = normalized.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
};

const decimalParts = (value) => {
  const normalized = canonicalDecimal(value);
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
};

const formatScaledDecimal = (raw, scale, maximumFractionDigits = 2) => {
  const targetScale = Math.max(0, maximumFractionDigits);
  let value = raw;
  let currentScale = scale;

  if (currentScale > targetScale) {
    const divisor = 10n ** BigInt(currentScale - targetScale);
    value = (value + divisor / 2n) / divisor;
    currentScale = targetScale;
  }

  const digits = value.toString().padStart(currentScale + 1, '0');
  const whole = currentScale ? digits.slice(0, -currentScale) || '0' : digits;
  const fraction = currentScale ? digits.slice(-currentScale).replace(/0+$/, '') : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
};

const multiplyDecimalForDisplay = (left, right, maximumFractionDigits = 2) => {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return '';
  return formatScaledDecimal(a.digits * b.digits, a.scale + b.scale, maximumFractionDigits);
};

const investorRedemptionStatusMeta = (status) => {
  switch (normalizeStatus(status)) {
    case 'PENDING_INVESTOR_AUTHORIZATION':
      return { label: 'Action Required', tooltip: 'Please confirm your redemption request to continue.' };
    case 'PENDING_ISSUER_APPROVAL':
      return { label: 'Awaiting Approval', tooltip: 'Your redemption request has been submitted and is waiting for approval.' };
    case 'ISSUER_APPROVED':
      return { label: 'Processing', tooltip: 'Your redemption has been approved and is now being processed.' };
    case 'TOKEN_LOCK_SUBMITTED':
      return { label: 'Processing', tooltip: 'Your redemption is being processed. No action is required from you.' };
    case 'TOKENS_LOCKED':
      return { label: 'Payment in Progress', tooltip: 'Your redemption is approved and the payment process is underway.' };
    case 'PAYMENT_SUBMITTED':
      return { label: 'Finalizing payment', tooltip: 'Your payment is being finalized. No action is required from you.' };
    case 'PAYMENT_CONFIRMED':
      return { label: 'Finalizing Redemption', tooltip: 'Your payment has been confirmed and your redemption is being finalized.' };
    case 'BURN_SUBMITTED':
    case 'BURN_CONFIRMED':
    case 'UNLOCK_SUBMITTED':
      return { label: 'Finalizing Redemption', tooltip: 'Your redemption is being finalized. No action is required from you.' };
    case 'COMPLETED':
      return { label: 'Completed', tooltip: 'Your redemption has been completed successfully.' };
    case 'ISSUER_REJECTED':
      return { label: 'Rejected', tooltip: 'Your redemption request was not approved.' };
    case 'CANCELLATION_PENDING':
      return { label: 'Cancelling', tooltip: 'Your cancellation request is being processed.' };
    case 'CANCELLED':
      return { label: 'Cancelled', tooltip: 'Your redemption request has been cancelled.' };
    case 'EXPIRED':
      return { label: 'Expired', tooltip: 'This redemption request expired before it was completed. You can submit a new request.' };
    case 'MANUAL_REVIEW':
      return { label: 'Under Review', tooltip: 'Your redemption requires additional review. No action is required from you at this time.' };
    case 'AWAITING_ISSUER':
      return { label: 'Awaiting Approval', tooltip: 'Your redemption request is waiting for approval.' };
    case 'CONFIRMED':
      return { label: 'Completed', tooltip: 'This step has been completed.' };
    case 'SUBMITTED':
    case 'PENDING':
      return { label: 'Processing', tooltip: 'Your redemption is being processed. No action is required from you.' };
    default: {
      const label = clean(status).replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) || 'Not started';
      return { label, tooltip: '' };
    }
  }
};

const friendlyStatus = (status) => investorRedemptionStatusMeta(status).label;

const redemptionPaymentHash = (redemption) => clean(
  redemption?.payment?.txHash
  || redemption?.paymentTxHash
  || redemption?.issuerPaymentTxHash
  || redemption?.verifiedIssuerPaymentHash,
);

const shortIdentifier = (value, leading = 10, trailing = 6) => {
  const normalized = clean(value);
  if (!normalized) return '—';
  return normalized.length > leading + trailing + 1
    ? `${normalized.slice(0, leading)}…${normalized.slice(-trailing)}`
    : normalized;
};

const shortHash = (value) => shortIdentifier(value, 8, 5);

const toConfirmationInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

const confirmationProgressFromText = (value) => {
  const text = clean(value);
  if (!text || !/confirm/i.test(text)) return null;

  const patterns = [
    /(\d+)\s*(?:of|\/)\s*(\d+)\s*confirmation(?:\(s\)|s)?/i,
    /(\d+)\s*confirmation(?:\(s\)|s)?\s*(?:of|\/)\s*(\d+)/i,
    /(\d+)\s*confirmation(?:\(s\)|s)?[^\d]{0,40}(\d+)\s*(?:confirmation(?:\(s\)|s)?\s*)?required/i,
    /confirmations?[^\d]{0,20}(\d+)[\s\S]{0,50}?required[^\d]{0,20}(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const current = toConfirmationInteger(match[1]);
    const required = toConfirmationInteger(match[2]);
    if (current !== null && required && required > 0) return { current, required };
  }

  const currentMatch = text.match(/(?:has|with|at)\s+(\d+)\s*confirmation(?:\(s\)|s)?/i)
    || text.match(/(\d+)\s*confirmation(?:\(s\)|s)?/i);
  const current = toConfirmationInteger(currentMatch?.[1]);
  return current === null ? null : { current, required: DEFAULT_REQUIRED_CONFIRMATIONS };
};

const confirmationProgressFromObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const current = [
    value.currentConfirmations,
    value.confirmationCount,
    value.confirmationsCount,
    value.blockConfirmations,
    value.confirmations,
    value.current,
  ].map(toConfirmationInteger).find((candidate) => candidate !== null);

  const required = [
    value.requiredConfirmations,
    value.confirmationsRequired,
    value.requiredConfirmationCount,
    value.minimumConfirmations,
    value.minConfirmations,
    value.confirmationTarget,
    value.required,
  ].map(toConfirmationInteger).find((candidate) => candidate !== null && candidate > 0);

  if (current !== undefined) {
    return { current, required: required || DEFAULT_REQUIRED_CONFIRMATIONS };
  }

  for (const candidate of [value.message, value.detail, value.reason, value.errorMessage]) {
    const parsed = confirmationProgressFromText(candidate);
    if (parsed) return parsed;
  }

  return null;
};

const confirmationProgressFromSources = (sources, fallbackMessage = '') => {
  for (const source of sources) {
    if (typeof source === 'string') {
      const parsed = confirmationProgressFromText(source);
      if (parsed) return parsed;
      continue;
    }
    const parsed = confirmationProgressFromObject(source);
    if (parsed) return parsed;
  }

  return confirmationProgressFromText(fallbackMessage);
};

const clampPhaseConfirmations = (progress) => {
  if (!progress) return 0;
  const current = toConfirmationInteger(progress.current) ?? 0;
  const required = toConfirmationInteger(progress.required) || DEFAULT_REQUIRED_CONFIRMATIONS;
  if (required <= 0) return 0;
  const scaled = Math.round((current / required) * DEFAULT_REQUIRED_CONFIRMATIONS);
  return Math.min(DEFAULT_REQUIRED_CONFIRMATIONS, Math.max(0, scaled));
};

const finalizingRedemptionProgressOf = (redemption, status, fallbackMessage = '') => {
  const fallback = clean(fallbackMessage);
  const burnFallback = /\bburn\b/i.test(fallback) || status === 'BURN_SUBMITTED' ? fallback : '';
  const unlockFallback = /\bunlock\b/i.test(fallback) || status === 'UNLOCK_SUBMITTED' ? fallback : '';
  const burnSources = [redemption?.burn, redemption?.platformBurn];
  const unlockSources = [redemption?.unlock, redemption?.platformUnlock];

  const burnProgress = confirmationProgressFromSources(burnSources, burnFallback);
  const unlockProgress = confirmationProgressFromSources(unlockSources, unlockFallback);

  const burnComplete = ['BURN_CONFIRMED', 'UNLOCK_SUBMITTED'].includes(status);
  const burnConfirmations = burnComplete
    ? DEFAULT_REQUIRED_CONFIRMATIONS
    : clampPhaseConfirmations(burnProgress);
  const unlockConfirmations = status === 'UNLOCK_SUBMITTED' || burnComplete
    ? clampPhaseConfirmations(unlockProgress)
    : 0;

  return {
    current: Math.min(
      FINALIZING_REDEMPTION_CONFIRMATIONS,
      burnConfirmations + unlockConfirmations,
    ),
    required: FINALIZING_REDEMPTION_CONFIRMATIONS,
  };
};

const confirmationProgressOf = (redemption, fallbackMessage = '') => {
  const status = normalizeStatus(redemption?.status);
  if (!CONFIRMATION_WAITING_REDEMPTION_STATUSES.has(status)) return null;

  if (['PAYMENT_CONFIRMED', 'BURN_SUBMITTED', 'BURN_CONFIRMED', 'UNLOCK_SUBMITTED'].includes(status)) {
    return finalizingRedemptionProgressOf(redemption, status, fallbackMessage);
  }

  const statusSpecificSources = (() => {
    if (status === 'TOKEN_LOCK_SUBMITTED' || status === 'ISSUER_APPROVED') {
      return [redemption?.tokenLock, redemption?.lock, redemption?.platformLock];
    }
    if (status === 'PAYMENT_SUBMITTED' || status === 'TOKENS_LOCKED') {
      return [redemption?.payment, redemption?.issuerPayment];
    }
    return [];
  })();

  return confirmationProgressFromSources([
    ...statusSpecificSources,
    redemption?.confirmationProgress,
    redemption?.confirmation,
    redemption?.transaction,
    redemption?.progress,
    redemption?.error,
    redemption,
  ], fallbackMessage);
};

const confirmationProgressPercent = (progress) => {
  if (!progress?.required) return null;
  return Math.min(100, Math.max(0, Math.round((progress.current / progress.required) * 100)));
};

const isConfirmationWaitingMessage = (value) => Boolean(confirmationProgressFromText(value));

const isExpectedRedemptionProgressMessage = (value, status) => {
  const message = clean(value);
  if (!message) return false;
  if (isConfirmationWaitingMessage(message)) return true;
  if (!CONFIRMATION_WAITING_REDEMPTION_STATUSES.has(normalizeStatus(status))) return false;

  return [
    /\b(?:burn|unlock|lock|payment)\s+transaction\b[\s\S]{0,80}\bnot yet available\b/i,
    /\btransaction\b[\s\S]{0,80}\bnot available yet\b/i,
    /\b(?:burn|unlock|lock|payment)\b[\s\S]{0,80}\b(?:still pending|is pending|awaiting)\b/i,
  ].some((pattern) => pattern.test(message));
};

function InvestorRedemptionProgress({ progress, compact = false }) {
  const percent = confirmationProgressPercent(progress);
  if (percent === null) return null;

  return (
    <span
      className={`investor-redemption-confirmation-progress${compact ? ' is-compact' : ''}`}
      role="progressbar"
      aria-label={`Redemption progress ${percent}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className="investor-redemption-confirmation-progress__track" aria-hidden="true">
        <span className="investor-redemption-confirmation-progress__fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="investor-redemption-confirmation-progress__percent">{percent}%</span>
    </span>
  );
}

const historyDate = (value) => {
  const raw = clean(value);
  if (!raw) return '—';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const redemptionHistoryTone = (status) => {
  switch (normalizeStatus(status)) {
    case 'COMPLETED': return 'completed';
    case 'ISSUER_REJECTED':
    case 'CANCELLED':
    case 'EXPIRED': return 'expired';
    case 'ISSUER_APPROVED':
    case 'TOKEN_LOCK_SUBMITTED':
    case 'TOKENS_LOCKED':
    case 'PAYMENT_SUBMITTED':
    case 'PAYMENT_CONFIRMED':
    case 'BURN_SUBMITTED':
    case 'BURN_CONFIRMED':
    case 'UNLOCK_SUBMITTED': return 'minting';
    case 'PENDING_INVESTOR_AUTHORIZATION':
    case 'PENDING_ISSUER_APPROVAL':
    case 'CANCELLATION_PENDING':
    case 'MANUAL_REVIEW': return 'pending';
    default: return 'neutral';
  }
};

const redemptionServerError = (redemption) => {
  const error = redemption?.error;
  if (!error) return '';
  if (typeof error === 'string') return sanitizeUserFacingMessage(clean(error));
  return sanitizeUserFacingMessage(clean(error?.message || error?.detail || error?.errorMessage));
};

export default function RedeemTokenPage({
  interestUid: interestUidOverride,
  embedded = false,
}) {
  const { interestUid: routeInterestUid } = useParams();
  const interestUid = interestUidOverride || routeInterestUid;
  const navigate = useNavigate();
  const { application, token, loading, error, ready } = useRegisteredInvestmentAction(interestUid);
  const [amount, setAmount] = useState('');
  const [serverAmountError, setServerAmountError] = useState('');
  const [redemption, setRedemption] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [flowError, setFlowError] = useState('');
  const [redemptionHistory, setRedemptionHistory] = useState([]);
  const [redemptionHistoryMeta, setRedemptionHistoryMeta] = useState({});
  const [redemptionHistoryPage, setRedemptionHistoryPage] = useState(1);
  const [redemptionHistorySearch, setRedemptionHistorySearch] = useState('');
  const [redemptionHistorySearchDebounced, setRedemptionHistorySearchDebounced] = useState('');
  const [redemptionHistoryStatus, setRedemptionHistoryStatus] = useState('all');
  const [redemptionHistoryLoading, setRedemptionHistoryLoading] = useState(false);
  const [redemptionHistoryError, setRedemptionHistoryError] = useState('');
  const [redemptionHistoryRefreshVersion, setRedemptionHistoryRefreshVersion] = useState(0);
  const [openHistoryActionUid, setOpenHistoryActionUid] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingRedemptionUid, setCancellingRedemptionUid] = useState('');
  const recoveryLoadedRef = useRef('');
  const completedPortfolioRefreshRef = useRef('');
  const operationLockRef = useRef(false);

  useEffect(() => {
    if (!openHistoryActionUid) return undefined;

    const closeOnPointerDown = (event) => {
      if (!event.target?.closest?.('.investor-token-redemption-action')) {
        setOpenHistoryActionUid('');
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenHistoryActionUid('');
    };

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openHistoryActionUid]);

  useDocumentTitle(
    embedded ? 'Asset Management' : token ? `${token.name} · Redeem Tokens` : 'Redeem Tokens',
  );

  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const preparedInvestorWallet = clean(redemption?.investorWalletAddress) || context.investorWalletAddress;
  const preparedChainId = redemption?.chainId || context.chainId;
  const walletGuard = useRegisteredInvestorWalletGuard(preparedInvestorWallet, preparedChainId);
  const tokenDecimals = supportedTokenDecimals(token?.decimals);
  const tokenUid = clean(token?.id || token?.tokenUid);
  const latestTokenPriceExact = canonicalDecimal(resolveCurrentTokenPriceExact(token || {}));

  const {
    balance: tokenWalletBalance,
    rawBalance: tokenWalletBalanceRaw,
    loading: tokenWalletBalanceLoading,
  } = useInvestorTokenWalletBalance({
    tokenAddress: clean(redemption?.tokenAddress) || context.tokenAddress,
    investorWalletAddress: preparedInvestorWallet,
    chainId: preparedChainId || walletGuard.targetChainId,
    tokenDecimals,
  });

  const normalizedAmount = canonicalDecimal(amount);
  const amountRaw = normalizedAmount ? safeParseUnits(normalizedAmount, tokenDecimals) : null;
  const redemptionUid = redemptionUidOf(redemption);
  const redemptionStatus = normalizeStatus(redemption?.status);
  const rejectionReason = redemptionRejectionReason(redemption);
  const terminal = Boolean(redemptionStatus && TERMINAL_REDEMPTION_STATUSES.has(redemptionStatus));
  const awaitingAuthorization = redemptionStatus === 'PENDING_INVESTOR_AUTHORIZATION';
  const activeRedemption = Boolean(redemptionUid && !terminal);
  const tokenPriceExact = canonicalDecimal(
    (activeRedemption && (
      redemption?.tokenPriceSnapshot
      || redemption?.tokenPrice
      || redemption?.currentTokenPrice
      || redemption?.pricePerToken
    ))
    || latestTokenPriceExact,
  );
  const validateAgainstBalance = !activeRedemption || awaitingAuthorization;

  const amountError = useMemo(() => {
    if (serverAmountError) return serverAmountError;
    if (!clean(amount)) return '';
    const normalized = canonicalDecimal(amount);
    if (!normalized || !isPositiveDecimal(normalized)) return 'Enter a token amount greater than zero.';
    if (decimalPlaces(clean(amount)) > tokenDecimals) {
      return `Enter no more than ${tokenDecimals} decimal place${tokenDecimals === 1 ? '' : 's'} for ${token?.symbol || 'this token'}.`;
    }
    const parsed = safeParseUnits(normalized, tokenDecimals);
    if (parsed === null || parsed <= 0n) return 'Enter a valid token amount greater than zero.';
    if (validateAgainstBalance && typeof tokenWalletBalanceRaw === 'bigint' && parsed > tokenWalletBalanceRaw) {
      const available = formatUnits(tokenWalletBalanceRaw, tokenDecimals);
      return `Redeem amount cannot exceed your wallet balance of ${formatExactTokenAmount(available)} ${token?.symbol || 'tokens'}.`;
    }
    return '';
  }, [amount, serverAmountError, token?.symbol, tokenDecimals, tokenWalletBalanceRaw, validateAgainstBalance]);

  const estimatedValue = normalizedAmount && tokenPriceExact
    ? multiplyDecimalForDisplay(normalizedAmount, tokenPriceExact, 2)
    : '';

  const canStartOrAuthorize = Boolean(
    walletGuard.ready
      && normalizedAmount
      && amountRaw !== null
      && amountRaw > 0n
      && !amountError
      && !busyAction
      && !tokenWalletBalanceLoading
      && (!activeRedemption || awaitingAuthorization),
  );

  const persistRecovery = useCallback((patch) => (
    saveInvestorTokenRedemptionRecovery(interestUid, patch)
  ), [interestUid]);

  const applyRedemption = useCallback((next, fallbackAmount = '') => {
    if (!next || typeof next !== 'object') return null;
    setRedemption(next);
    const nextAmount = canonicalDecimal(next?.tokenAmount || fallbackAmount);
    if (nextAmount) setAmount(nextAmount);

    const uid = redemptionUidOf(next);
    if (uid) {
      persistRecovery({
        tokenUid: clean(next?.tokenUid) || tokenUid,
        redemptionUid: uid,
        tokenAmount: nextAmount,
      });
    }

    if (uid && normalizeStatus(next?.status) === 'COMPLETED' && completedPortfolioRefreshRef.current !== uid) {
      completedPortfolioRefreshRef.current = uid;
      investorPortfolioService.refreshAfterCompletedActivity().catch(() => {});
    }

    return next;
  }, [interestUid, persistRecovery, tokenUid]);

  const refreshRedemption = useCallback(async (uid, { signal } = {}) => {
    if (!uid) return null;
    const next = await investmentApi.getTokenRedemption(uid, { signal });
    return applyRedemption(next);
  }, [applyRedemption]);

  useEffect(() => {
    if (!interestUid || !tokenUid || loading || !ready) return undefined;
    const loadKey = `${interestUid}:${tokenUid}`;
    if (recoveryLoadedRef.current === loadKey) return undefined;
    recoveryLoadedRef.current = loadKey;

    const stored = loadInvestorTokenRedemptionRecovery(interestUid);
    if (!stored) return undefined;
    if (stored.tokenUid && stored.tokenUid !== tokenUid) {
      clearInvestorTokenRedemptionRecovery(interestUid);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    if (stored.tokenAmount) setAmount(canonicalDecimal(stored.tokenAmount));

    const recover = async () => {
      try {
        if (stored.redemptionUid) {
          await refreshRedemption(stored.redemptionUid, { signal: controller.signal });
          return;
        }

        // If the browser closed after POST was sent but before its UID was saved,
        // replay the same idempotent create request instead of creating a new intent.
        if (stored.idempotencyKey && stored.tokenAmount) {
          const prepared = await investmentApi.createTokenRedemption(tokenUid, {
            tokenAmount: stored.tokenAmount,
            idempotencyKey: stored.idempotencyKey,
          });
          if (!cancelled) applyRedemption(prepared, stored.tokenAmount);
        }
      } catch (recoveryError) {
        if (controller.signal.aborted || cancelled) return;
        if (Number(recoveryError?.response?.status) === 404) {
          clearInvestorTokenRedemptionRecovery(interestUid);
          return;
        }
        setFlowError(getErrorMessage(recoveryError, 'We could not restore the latest redemption request.'));
      }
    };

    recover();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [applyRedemption, interestUid, loading, ready, refreshRedemption, tokenUid]);

  useEffect(() => {
    if (!redemptionUid || terminal) return undefined;

    let cancelled = false;
    let timer = null;
    let inFlight = false;
    let failures = 0;

    const schedule = (delay) => {
      if (!cancelled) timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState === 'hidden') {
        schedule(POLL_INTERVAL_MS);
        return;
      }

      inFlight = true;
      try {
        const next = await investmentApi.getTokenRedemption(redemptionUid);
        if (cancelled) return;
        failures = 0;
        const applied = applyRedemption(next);
        if (!TERMINAL_REDEMPTION_STATUSES.has(normalizeStatus(applied?.status))) {
          schedule(POLL_INTERVAL_MS);
        }
      } catch (pollError) {
        if (cancelled) return;
        failures += 1;
        const delay = Math.min(POLL_INTERVAL_MS * (2 ** Math.min(failures, 4)), MAX_POLL_INTERVAL_MS);
        schedule(delay);
      } finally {
        inFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        if (timer) window.clearTimeout(timer);
        poll();
      }
    };
    const refreshOnFocus = () => {
      if (timer) window.clearTimeout(timer);
      poll();
    };

    schedule(POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [applyRedemption, redemptionUid, terminal]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRedemptionHistorySearchDebounced(clean(redemptionHistorySearch));
      setRedemptionHistoryPage(1);
    }, HISTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [redemptionHistorySearch]);

  useEffect(() => {
    if (!tokenUid || !ready) return undefined;
    const controller = new AbortController();
    let active = true;

    setRedemptionHistoryLoading(true);
    setRedemptionHistoryError('');
    investmentApi.listTokenRedemptions(tokenUid, {
      page: redemptionHistoryPage,
      limit: HISTORY_LIMIT,
      search: redemptionHistorySearchDebounced,
      status: redemptionHistoryStatus,
      signal: controller.signal,
    })
      .then(({ data, meta }) => {
        if (!active) return;
        setRedemptionHistory(Array.isArray(data) ? data : []);
        setRedemptionHistoryMeta(meta || {});
      })
      .catch((historyError) => {
        if (!active || controller.signal.aborted) return;
        setRedemptionHistoryError(getErrorMessage(historyError, 'Redemption history is temporarily unavailable.'));
      })
      .finally(() => {
        if (active) setRedemptionHistoryLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [ready, redemptionHistoryPage, redemptionHistoryRefreshVersion, redemptionHistorySearchDebounced, redemptionHistoryStatus, tokenUid]);

  const historyHasPendingCancellation = redemptionHistory.some(
    (item) => normalizeStatus(item?.status) === 'CANCELLATION_PENDING',
  );

  useEffect(() => {
    if (!activeRedemption && !historyHasPendingCancellation) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setRedemptionHistoryRefreshVersion((value) => value + 1);
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [activeRedemption, historyHasPendingCancellation]);

  const prepareRedemption = useCallback(async () => {
    if (!tokenUid) throw new Error('The token identifier is unavailable. Refresh the page and try again.');
    if (!normalizedAmount || amountError) {
      throw new Error(amountError || 'Enter a token amount greater than zero.');
    }

    const idempotencyKey = createLocalId('redemption');
    clearInvestorTokenRedemptionRecovery(interestUid);
    persistRecovery({
      tokenUid,
      redemptionUid: '',
      tokenAmount: normalizedAmount,
      idempotencyKey,
    });

    const prepared = await investmentApi.createTokenRedemption(tokenUid, {
      tokenAmount: normalizedAmount,
      idempotencyKey,
    });
    const uid = redemptionUidOf(prepared);
    if (!uid) throw new Error('We could not start the redemption request. Please try again.');
    const applied = applyRedemption(prepared, normalizedAmount);
    setRedemptionHistoryRefreshVersion((value) => value + 1);
    return applied;
  }, [amountError, applyRedemption, interestUid, normalizedAmount, persistRecovery, tokenUid]);

  const authorizeRedemption = useCallback(async (prepared) => {
    const uid = redemptionUidOf(prepared);
    if (!uid) throw new Error('The redemption identifier is unavailable. Refresh the page and try again.');

    const signature = await signInvestorTokenRedemptionAuthorization({
      connector: walletGuard.wallet.connector,
      connectedAddress: walletGuard.wallet.address,
      registeredWalletAddress: clean(prepared?.investorWalletAddress) || context.investorWalletAddress,
      chainId: prepared?.chainId || context.chainId || walletGuard.targetChainId,
      preparedRedemption: prepared,
    });

    const next = await investmentApi.authorizeTokenRedemption(uid, signature);
    const applied = applyRedemption(next, prepared?.tokenAmount || normalizedAmount);
    setRedemptionHistoryRefreshVersion((value) => value + 1);
    return applied;
  }, [applyRedemption, context.chainId, context.investorWalletAddress, normalizedAmount, walletGuard.targetChainId, walletGuard.wallet.address, walletGuard.wallet.connector]);

  const handleRedeem = async () => {
    if (operationLockRef.current) return;
    if (!walletGuard.ready) {
      toast.error('Connect the registered investor wallet on the required network to continue.');
      return;
    }
    if (!normalizedAmount || amountError || amountRaw === null || amountRaw <= 0n) {
      toast.error(amountError || 'Enter a token amount greater than zero.');
      return;
    }
    if (tokenWalletBalanceLoading) {
      toast.info('Checking your token balance. Please wait a moment.');
      return;
    }
    if (activeRedemption && !awaitingAuthorization) return;

    operationLockRef.current = true;
    setBusyAction(awaitingAuthorization ? 'AUTHORIZE' : 'PREPARE');
    setFlowError('');
    setServerAmountError('');
    let preparedRequest = awaitingAuthorization ? redemption : null;

    try {
      const prepared = preparedRequest || await prepareRedemption();
      preparedRequest = prepared;
      if (normalizeStatus(prepared?.status) !== 'PENDING_INVESTOR_AUTHORIZATION') {
        toast.info('Your redemption request is already being processed.');
        return;
      }

      setBusyAction('AUTHORIZE');
      const authorized = await authorizeRedemption(prepared);
      const status = normalizeStatus(authorized?.status);
      if (status === 'PENDING_ISSUER_APPROVAL') {
        toast.success('Redemption request confirmed', {
          description: 'Your request has been sent to the issuer for review.',
        });
      } else {
        toast.success('Redemption request submitted', {
          description: `Current status: ${friendlyStatus(status)}.`,
        });
      }
    } catch (redeemError) {
      if (isInvestorRedemptionWalletRejection(redeemError)) {
        toast.info('Wallet confirmation was cancelled. You can confirm the same redemption request when ready.');
        return;
      }

      const tokenAmountFieldError = getApiFieldErrors(redeemError).find(({ field }) => (
        field === 'tokenAmount' || field.endsWith('.tokenAmount')
      ));
      if (tokenAmountFieldError?.message) setServerAmountError(tokenAmountFieldError.message);

      const message = getErrorMessage(redeemError, 'We could not submit this redemption request. Please try again.');
      setFlowError(message);
      toast.error('Unable to redeem tokens', { description: message });

      const statusCode = Number(redeemError?.response?.status);
      if (!redemptionUidOf(preparedRequest) && statusCode >= 400 && statusCode < 500 && statusCode !== 409) {
        clearInvestorTokenRedemptionRecovery(interestUid);
      }
    } finally {
      setBusyAction('');
      operationLockRef.current = false;
    }
  };

  const requestCancellation = (row) => {
    const uid = redemptionUidOf(row);
    if (!uid || !CANCELLABLE_REDEMPTION_STATUSES.has(normalizeStatus(row?.status))) return;
    setOpenHistoryActionUid('');
    setCancelTarget(row);
  };

  const closeCancellationDialog = () => {
    if (cancellingRedemptionUid) return;
    setCancelTarget(null);
  };

  const handleCancelRedemption = async () => {
    const uid = redemptionUidOf(cancelTarget);
    if (!uid || cancellingRedemptionUid) return;

    setCancellingRedemptionUid(uid);
    setFlowError('');
    try {
      const next = await investmentApi.cancelTokenRedemption(uid);
      const nextStatus = normalizeStatus(next?.status);

      setRedemptionHistory((items) => items.map((item) => (
        redemptionUidOf(item) === uid ? { ...item, ...next } : item
      )));

      if (uid === redemptionUid) {
        applyRedemption(next, next?.tokenAmount || amount);
      }

      setCancelTarget(null);
      setRedemptionHistoryRefreshVersion((value) => value + 1);

      if (nextStatus === 'CANCELLED') {
        toast.success('Redemption cancelled', {
          description: 'This redemption request has been cancelled.',
        });
      } else {
        toast.success('Cancellation requested', {
          description: 'Your redemption is being cancelled. The status will update automatically.',
        });
      }
    } catch (cancelError) {
      const statusCode = Number(cancelError?.response?.status);
      const errorCode = clean(
        cancelError?.response?.data?.error?.code
        || cancelError?.response?.data?.code,
      ).toUpperCase();

      if (statusCode === 409 || errorCode === 'REDEMPTION_CANCELLATION_NOT_ALLOWED') {
        toast.info('Cancellation is no longer available', {
          description: 'Payment processing has already started for this redemption.',
        });

        try {
          if (uid === redemptionUid) await refreshRedemption(uid);
        } catch {
          // The history refresh below is enough if the detail refresh is temporarily unavailable.
        }
        setCancelTarget(null);
        setRedemptionHistoryRefreshVersion((value) => value + 1);
        return;
      }

      const message = getErrorMessage(cancelError, 'We could not cancel this redemption request. Please try again.');
      toast.error('Unable to cancel redemption', { description: message });
    } finally {
      setCancellingRedemptionUid('');
    }
  };

  const handleAmountChange = (event) => {
    const next = event.target.value.replace(/,/g, '');
    if (!/^\d*(?:\.\d*)?$/.test(next)) return;
    setAmount(next);
    setServerAmountError('');
    setFlowError('');
  };

  const handleAmountBlur = () => {
    if (!amount || amount.endsWith('.')) {
      const canonical = canonicalDecimal(amount);
      if (canonical) setAmount(canonical);
      return;
    }
    const canonical = canonicalDecimal(amount);
    if (canonical) setAmount(canonical);
  };

  if (loading) {
    return <div className="page-stack investor-token-action-page"><div className="investor-token-action-loading" /><div className="investor-token-action-loading investor-token-action-loading--tall" /></div>;
  }

  if (error || !application || !token) {
    return (
      <TokenActionUnavailable
        title="Redeem Tokens"
        description="This investment could not be loaded right now."
        onBack={embedded ? undefined : () => navigate(ROUTES.applications)}
      />
    );
  }

  if (!ready) {
    return (
      <TokenActionUnavailable
        title="Redeem Tokens"
        description="Redemption is not available for this application yet."
      />
    );
  }

  const currentStatusLabel = redemptionStatus ? friendlyStatus(redemptionStatus) : 'Ready to redeem';
  const serverFlowError = redemptionServerError(redemption);
  const currentConfirmationProgress = confirmationProgressOf(redemption, `${flowError} ${serverFlowError}`);
  const visibleFlowError = redemptionStatus === 'ISSUER_REJECTED'
    ? ''
    : [flowError, serverFlowError].find((message) => (
        message && !isExpectedRedemptionProgressMessage(message, redemptionStatus)
      )) || '';
  const inputLocked = activeRedemption;
  const buttonLabel = awaitingAuthorization
    ? 'Confirm Redemption'
    : activeRedemption
      ? 'Redemption In Progress'
      : 'Redeem Tokens';
  const buttonBusy = Boolean(busyAction);
  const historyTotal = Number(
    redemptionHistoryMeta?.total
    ?? redemptionHistoryMeta?.totalCount
    ?? redemptionHistoryMeta?.totalRecords
    ?? redemptionHistoryMeta?.pagination?.total
    ?? redemptionHistory.length,
  );
  const historyCurrentPage = Number(
    redemptionHistoryMeta?.page
    ?? redemptionHistoryMeta?.currentPage
    ?? redemptionHistoryMeta?.pagination?.page
    ?? redemptionHistoryPage,
  ) || redemptionHistoryPage;
  const historyTotalPages = Math.max(1, Number(
    redemptionHistoryMeta?.totalPages
    ?? redemptionHistoryMeta?.pages
    ?? redemptionHistoryMeta?.lastPage
    ?? redemptionHistoryMeta?.pagination?.totalPages
    ?? redemptionHistoryMeta?.pagination?.pages
    ?? (historyTotal ? Math.ceil(historyTotal / HISTORY_LIMIT) : 1),
  ) || 1);

  return (
    <div className="page-stack investor-token-action-page investor-token-redemption-page">
      {!embedded ? (
        <InvestorTokenActionHeader
          eyebrow="Token action"
          title="Redeem Tokens"
          description="Submit your redemption request and track its progress through approval, payment, and completion."
        />
      ) : null}

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Registered investor" />

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading"><div><span>Selected token</span><h2>Redeem from your registered wallet</h2></div><WalletCards size={19} /></div>
            <LockedAddressField label="Primary Investment Wallet" value={preparedInvestorWallet} />
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div><span>Redeem amount</span><h2>How many tokens would you like to redeem?</h2></div>
              <small>
                {tokenWalletBalanceLoading
                  ? 'Checking available balance…'
                  : `Available to redeem: ${formatExactTokenAmount(tokenWalletBalance, '—')} ${token.symbol}`}
              </small>
            </div>
            <label className={`investor-token-action-amount-field ${amountError ? 'is-invalid' : ''} ${inputLocked ? 'is-locked' : ''}`}>
              <span className="sr-only">Token amount to redeem</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={handleAmountChange}
                onBlur={handleAmountBlur}
                placeholder="0.00"
                aria-invalid={Boolean(amountError)}
                aria-describedby="redeem-amount-help"
                disabled={inputLocked}
              />
              <strong>{token.symbol}</strong>
            </label>
            {amountError ? <p className="investor-token-action-field-error" role="alert">{amountError}</p> : null}
            <p id="redeem-amount-help" className="investor-token-action-field-hint">
              Enter a positive decimal amount up to your available token balance. The amount will be checked again before the request is submitted.
            </p>
            <div className="investor-token-action-calculation"><span>Estimated redemption value</span><strong>{estimatedValue ? `$${estimatedValue} ${token.currency || ''}` : '—'}</strong></div>
          </Card>

          {redemptionStatus === 'MANUAL_REVIEW' || redemptionStatus === 'ISSUER_REJECTED' || visibleFlowError ? (
            <div className="investor-token-redemption-messages" aria-live="polite">
              {redemptionStatus === 'MANUAL_REVIEW' ? (
                <div className="investor-token-action-note">
                  <Info size={17} />
                  <p><strong>Additional review</strong>Your redemption is under review. If support asks for it, share redemption ID <code>{redemptionUid || 'unavailable'}</code>.</p>
                </div>
              ) : null}

              {redemptionStatus === 'ISSUER_REJECTED' ? (
                <div className="investor-token-action-note investor-token-action-note--rejection" role="status">
                  <Info size={17} />
                  <p>
                    <strong>Why your redemption was not approved</strong>
                    {rejectionReason || 'No rejection reason is available for this request.'}
                  </p>
                </div>
              ) : null}

              {visibleFlowError ? (
                <div className="investor-token-action-note investor-token-action-note--warning" role="alert">
                  <Info size={17} />
                  <p><strong>Redemption needs attention</strong>{visibleFlowError}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title"><span>Redemption summary</span><RotateCcw size={18} /></div>
            <div className="investor-token-order-row"><span>{activeRedemption ? 'Redemption Price' : 'Current Token Price'}</span><strong>{tokenPriceExact ? `$${formatExactTokenAmount(tokenPriceExact)} ${token.currency || ''}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>Redeem Amount</span><strong>{normalizedAmount ? `${formatExactTokenAmount(normalizedAmount)} ${token.symbol}` : '—'}</strong></div>
            <div className="investor-token-order-row investor-token-order-row--primary"><span>Estimated Value</span><strong>{estimatedValue ? `$${estimatedValue} ${token.currency || ''}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>Network</span><strong>{walletGuard.targetNetworkLabel}</strong></div>
            <div className="investor-token-order-row">
              <span>Wallet Balance</span>
              <strong>
                {tokenWalletBalanceLoading
                  ? 'Loading…'
                  : tokenWalletBalance
                    ? `${formatExactTokenAmount(tokenWalletBalance)} ${token.symbol || ''}`
                    : `— ${token.symbol || ''}`}
              </strong>
            </div>
            {redemptionStatus ? (
              <div className="investor-token-order-row investor-token-order-row--redemption-status">
                <span>Status</span>
                <span className="investor-token-order-status">
                  <strong>{currentStatusLabel}</strong>
                  <InvestorRedemptionProgress progress={currentConfirmationProgress} />
                </span>
              </div>
            ) : null}
            <div className="investor-token-action-note" role="status">
              <Info size={17} />
              <p>Your redemption request is being reviewed by the issuer. No action is required from you unless you want to cancel the request. Once approved, your redemption will be processed.</p>
            </div>
            <RegisteredInvestorWalletGate guard={walletGuard} actionLabel={awaitingAuthorization ? 'confirm redemption' : 'redeem tokens'} />
            <Button
              className="investor-token-order-card__cta"
              icon={RotateCcw}
              onClick={handleRedeem}
              loading={buttonBusy}
              disabled={!canStartOrAuthorize}
            >
              {buttonLabel}
            </Button>
            <small className="investor-token-order-card__footnote">
              {!walletGuard.ready
                ? 'Connect the registered wallet on the required network to enable this action.'
                : tokenWalletBalanceLoading
                  ? 'Checking your live token balance before redemption.'
                  : amountError
                    ? amountError
                    : activeRedemption && !awaitingAuthorization
                      ? 'This redemption is in progress and updates automatically. No additional wallet action is needed right now.'
                      : awaitingAuthorization
                        ? 'Confirm the existing request. A new redemption will not be created.'
                        : 'Your amount will be checked again before the redemption request is created.'}
            </small>
          </Card>
        </aside>
      </div>

      <Card className="investor-token-purchase-history investor-token-redemption-history">
        <div className="investor-token-purchase-history__header">
          <div className="investor-token-purchase-history__heading">
            <span className="investor-token-purchase-history__icon"><History size={18} /></span>
            <div>
              <h2>Redemption History</h2>
              <p>Track your {token.symbol} redemption requests from confirmation through payment and completion.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCcw}
            onClick={() => setRedemptionHistoryRefreshVersion((value) => value + 1)}
            disabled={redemptionHistoryLoading}
            loading={redemptionHistoryLoading && Boolean(redemptionHistory.length)}
          >
            Refresh
          </Button>
        </div>

        <div className="investor-token-purchase-history__toolbar">
          <label className="investor-token-purchase-history__search">
            <Search size={16} />
            <span className="sr-only">Search redemption history</span>
            <input
              type="search"
              value={redemptionHistorySearch}
              onChange={(event) => setRedemptionHistorySearch(event.target.value)}
              maxLength={100}
              placeholder="Search redemption ID, amount or hash"
            />
          </label>
          <div className="investor-token-purchase-history__filter">
            <span className="sr-only">Filter redemption history by status</span>
            <MarketplaceDropdown
              value={redemptionHistoryStatus}
              options={REDEMPTION_HISTORY_FILTERS}
              onChange={(value) => {
                setRedemptionHistoryStatus(value);
                setRedemptionHistoryPage(1);
              }}
              ariaLabel="Filter redemption history by status"
              className="investor-token-purchase-history__filter-dropdown"
              menuClassName="investor-token-purchase-history__filter-menu"
              align="end"
              portal
            />
          </div>
        </div>

        <div className="investor-token-purchase-history__summary">
          <span>{historyTotal} redemption{historyTotal === 1 ? '' : 's'}</span>
          {activeRedemption ? <span className="is-live"><RotateCcw size={13} /> Active redemption is updating</span> : null}
        </div>

        {redemptionHistoryError ? (
          <div className="investor-token-purchase-history__message is-error" role="status">
            <Info size={17} />
            <div>
              <strong>History temporarily unavailable</strong>
              <p>{redemptionHistoryError}</p>
            </div>
            <button type="button" onClick={() => setRedemptionHistoryRefreshVersion((value) => value + 1)}>Try again</button>
          </div>
        ) : null}

        {redemptionHistoryLoading && !redemptionHistory.length ? (
          <div className="investor-token-purchase-history__loading" aria-label="Loading redemption history">
            <span /><span /><span />
          </div>
        ) : redemptionHistory.length ? (
          <div className="investor-token-purchase-history__table" role="table" aria-label={`${token.symbol} redemption history`}>
            <div className="investor-token-purchase-history__table-head" role="row">
              <span role="columnheader">Redemption Date</span>
              <span role="columnheader">Redemption Amount</span>
              <span role="columnheader">Redemption Status</span>
              <span role="columnheader">Payment Tx Hash</span>
              <span role="columnheader">Redemption ID</span>
              <span role="columnheader" className="investor-token-redemption-history__action-heading">Action</span>
            </div>

            {redemptionHistory.map((row, index) => {
              const rowRedemptionId = redemptionUidOf(row);
              const rowKey = rowRedemptionId || `redemption-${index}`;
              const rowPaymentHash = redemptionPaymentHash(row);
              const rowChainId = row?.chainId || preparedChainId;
              const rowExplorerName = transactionExplorerName(rowChainId);
              const rowPaymentHashUrl = transactionExplorerUrl(rowPaymentHash, rowChainId);
              const rowStatusSource = rowRedemptionId && rowRedemptionId === redemptionUid ? redemption : row;
              const rowEffectiveStatus = rowStatusSource?.status || row?.status;
              const rowStatus = investorRedemptionStatusMeta(rowEffectiveStatus);
              const rowRejectionReason = redemptionRejectionReason(rowStatusSource);
              const rowStatusTooltip = normalizeStatus(rowEffectiveStatus) === 'ISSUER_REJECTED' && rowRejectionReason
                ? `${rowStatus.tooltip} Reason: ${rowRejectionReason}`
                : rowStatus.tooltip;
              const rowConfirmationProgress = confirmationProgressOf(
                rowRedemptionId && rowRedemptionId === redemptionUid ? redemption : row,
                redemptionServerError(row),
              );
              const rowCanCancel = Boolean(
                rowRedemptionId
                && CANCELLABLE_REDEMPTION_STATUSES.has(normalizeStatus(rowEffectiveStatus)),
              );
              const rowActionOpen = rowCanCancel && openHistoryActionUid === rowRedemptionId;
              return (
                <div className="investor-token-purchase-history__row" key={rowKey} role="row">
                  <span className="investor-token-purchase-history__cell" data-label="Redemption Date" role="cell"><strong>{historyDate(row?.createdAt || row?.submittedAt || row?.updatedAt)}</strong></span>
                  <span className="investor-token-purchase-history__cell" data-label="Redemption Amount" role="cell"><strong>{formatExactTokenAmount(row?.tokenAmount)} {token.symbol}</strong></span>
                  <span className="investor-token-purchase-history__cell" data-label="Redemption Status" role="cell">
                    <span className="investor-token-redemption-history__status">
                      <span
                        className={`investor-token-purchase-history__badge is-${redemptionHistoryTone(rowEffectiveStatus)}`}
                        data-tooltip={rowStatusTooltip || undefined}
                        aria-label={rowStatusTooltip ? `${rowStatus.label}. ${rowStatusTooltip}` : rowStatus.label}
                        tabIndex={rowStatusTooltip ? 0 : undefined}
                      >
                        {rowStatus.label}
                      </span>
                      <InvestorRedemptionProgress progress={rowConfirmationProgress} compact />
                    </span>
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Payment Tx Hash" role="cell">
                    {rowPaymentHashUrl ? (
                      <a
                        href={rowPaymentHashUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="investor-token-purchase-history__hash"
                        title={`View payment transaction on ${rowExplorerName}`}
                        aria-label={`View payment transaction ${rowPaymentHash} on ${rowExplorerName}`}
                      >
                        {shortHash(rowPaymentHash)} <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    ) : rowPaymentHash ? <strong title={rowPaymentHash}>{shortHash(rowPaymentHash)}</strong> : <strong>—</strong>}
                  </span>
                  <span className="investor-token-purchase-history__cell" data-label="Redemption ID" role="cell"><strong title={rowRedemptionId || undefined}>{rowRedemptionId ? shortIdentifier(rowRedemptionId) : '—'}</strong></span>
                  <span className="investor-token-purchase-history__cell investor-token-redemption-history__action-cell" data-label="Action" role="cell">
                    {rowCanCancel ? (
                      <span className="investor-token-redemption-action">
                        <button
                          type="button"
                          className={`investor-token-redemption-action__trigger${rowActionOpen ? ' is-open' : ''}`}
                          aria-label="Open redemption actions"
                          aria-haspopup="menu"
                          aria-expanded={rowActionOpen}
                          onClick={() => setOpenHistoryActionUid((current) => (
                            current === rowRedemptionId ? '' : rowRedemptionId
                          ))}
                        >
                          <MoreVertical size={17} aria-hidden="true" />
                        </button>
                        {rowActionOpen ? (
                          <span className="investor-token-redemption-action__menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => requestCancellation(row)}
                            >
                              <XCircle size={16} aria-hidden="true" />
                              <span>Cancel redemption</span>
                            </button>
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="investor-token-redemption-history__action-empty" aria-label="No actions available">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="investor-token-purchase-history__empty">
            <History size={24} />
            <strong>{redemptionHistorySearchDebounced || redemptionHistoryStatus !== 'all' ? 'No matching redemptions' : 'No redemptions yet'}</strong>
            <p>{redemptionHistorySearchDebounced || redemptionHistoryStatus !== 'all' ? 'Try a different search or status filter.' : `Your ${token.symbol} redemption activity will appear here after you submit a request.`}</p>
          </div>
        )}

        <InvestorHistoryPagination
          page={historyCurrentPage}
          totalPages={historyTotalPages}
          onPageChange={setRedemptionHistoryPage}
          disabled={redemptionHistoryLoading}
          itemLabel="Redemption history"
        />
      </Card>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={closeCancellationDialog}
        title="Cancel redemption?"
        trapFocus
        className="investor-redemption-cancel-modal"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={closeCancellationDialog}
              disabled={Boolean(cancellingRedemptionUid)}
            >
              Keep redemption
            </Button>
            <Button
              variant="danger"
              icon={XCircle}
              onClick={handleCancelRedemption}
              loading={Boolean(cancellingRedemptionUid)}
            >
              Cancel redemption
            </Button>
          </>
        )}
      >
        <div className="investor-redemption-cancel-modal__content">
          <span className="investor-redemption-cancel-modal__icon" aria-hidden="true">
            <XCircle size={20} />
          </span>
          <div>
            <strong>Cancel this redemption request</strong>
            <p>
              This will stop the redemption if payment processing has not started yet.
              You can submit a new redemption request later if needed.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
