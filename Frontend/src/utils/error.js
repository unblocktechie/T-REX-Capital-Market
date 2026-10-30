import { getRetryAfterMs } from '@/utils/retry';


const CHAIN_ERROR_MESSAGES = Object.freeze({
  SELECTED_CHAIN_REQUIRED: 'Choose a network before continuing.',
  INVALID_SELECTED_CHAIN: 'The selected network is no longer available. Refresh the network list and choose another network.',
  CHAIN_NOT_FOUND: 'The selected network is unavailable or inactive. Choose another available network.',
  SELECTED_CHAIN_MISMATCH: 'This action belongs to a different network. Switch to the network shown for this item, then try again.',
  RESOURCE_NOT_FOUND_ON_SELECTED_CHAIN: 'This item is not available on the selected network. Return to the list and choose an item from this network.',
  CHAIN_LOCKED: 'This network is locked for your account. Open Network Access and unlock it before continuing.',
  CHAIN_IDENTITY_REQUIRED: 'This network must be unlocked before you can continue.',
  UNSUPPORTED_CHAIN: 'This blockchain network is not currently supported by the platform. Refresh the page and choose an available network.',
  CHAIN_IDENTITY_CREATION_IN_PROGRESS: 'Your network access is still being prepared. Please wait a moment and check Network Access again shortly.',
  CHAIN_IDENTITY_CREATION_FAILED: 'Your network access could not be prepared. Open Network Access to review the message and retry.',
  PAYMENT_TOKEN_REGISTRY_UNAVAILABLE: 'Payment-token availability could not be verified on-chain for this network. No payment action can continue until verification is available.',
});

const DEFAULT_PUBLIC_ERROR = 'Something went wrong. Please try again.';

const apiErrorCode = (error) => String(
  error?.response?.data?.code ||
  error?.response?.data?.error?.code ||
  error?.code ||
  '',
).trim().toUpperCase();

const firstValidationMessage = (errors) => {
  if (!errors) return null;
  if (Array.isArray(errors)) {
    const first = errors[0];
    return typeof first === 'string' ? first : first?.message;
  }
  if (typeof errors === 'object') {
    const first = Object.values(errors).flat()[0];
    return typeof first === 'string' ? first : first?.message;
  }
  return null;
};

const normalizeMessage = (message) => String(message || '').replace(/\s+/g, ' ').trim();

/**
 * Convert low-level wallet/RPC/contract messages into language that is safe to
 * show to end users. Raw provider diagnostics still remain available to the
 * calling code / browser console for engineering diagnostics, but they must
 * never be copied into a toast, banner, or validation message.
 */
const technicalBlockchainMessage = (message) => {
  const text = normalizeMessage(message);
  if (!text) return '';

  if (/user rejected|user denied|request rejected|rejected the request|request was cancel(?:led|ed)/i.test(text)) {
    return 'The wallet request was cancelled. No changes were made.';
  }

  if (/max fee per gas.*(?:less than|below).*base fee|fee cap.*base fee|base fee exceeds|maxfeepergas|replacement transaction underpriced/i.test(text)) {
    return 'Network fees changed while the transaction was being prepared. Please wait a moment and try again.';
  }

  if (/insufficient funds(?: for gas| for intrinsic transaction cost| for transfer)?|insufficient (?:native )?balance.{0,50}(?:gas|network fee)/i.test(text)) {
    return 'The connected wallet does not have enough network currency to cover the transaction fee.';
  }

  if (/nonce too low|nonce too high|nonce has already been used|already known|replacement fee too low|transaction underpriced/i.test(text)) {
    return 'Your wallet transaction status is still updating. Wait a moment, refresh the wallet, and try again.';
  }

  if (/already registered|already exists|identity already registered|investor already registered/i.test(text)) {
    return 'This action appears to have already been completed. Refresh the page to load the latest status.';
  }

  if (/transport request timed out|transporttimeouterror|failed to fetch|network request failed|rpc (?:request|error)|json-rpc|rpc_error|http request failed|socket hang up|503 service unavailable/i.test(text)) {
    return 'The blockchain network is temporarily unavailable. Please try again in a moment.';
  }

  if (/cannot estimate gas|estimatecontractgas|eth_estimategas|gas required exceeds allowance|transaction gas limit|gas limit too high|intrinsic gas too low/i.test(text)) {
    return 'The transaction could not be prepared. Refresh the latest status and try again.';
  }

  if (/contract function .*reverted|contractfunctionrevertederror|contractfunctionexecutionerror|execution reverted|revert reason|contract call:|eth_sendrawtransaction|sendrawtransaction|transactionexecutionerror/i.test(text)) {
    return 'This action could not be completed on the selected network. Refresh the latest status and try again. If the issue continues, contact support.';
  }

  // Viem/wagmi/provider diagnostics typically include one or more of these
  // sections. They are useful to engineers but should never be rendered to a
  // customer even when an upstream library changes the leading error text.
  const looksLikeDeveloperDiagnostic =
    /\b(?:request arguments|raw call arguments|contract call|function:\s*\w+|args:\s*\[|docs:\s*https?:\/\/|version:\s*@?(?:viem|wagmi)|abi item|rpc method|error data:)\b/i.test(text)
    || /https?:\/\/(?:viem\.sh|wagmi\.sh|docs\.metamask\.io)/i.test(text)
    || (/0x[a-f0-9]{40,}/i.test(text) && text.length > 220)
    || text.length > 900;

  if (looksLikeDeveloperDiagnostic) {
    return 'The wallet could not complete this action. Refresh the latest status and try again. If the issue continues, contact support.';
  }

  return '';
};

export const sanitizeUserFacingMessage = (message, fallback = DEFAULT_PUBLIC_ERROR) => {
  if (typeof message !== 'string') return message;

  const normalized = normalizeMessage(message);
  if (!normalized) return '';

  const technicalMessage = technicalBlockchainMessage(normalized);
  if (technicalMessage) return technicalMessage;

  const sanitized = normalized
    .replace(/\bBackend\s+API\b/g, 'Service')
    .replace(/\bbackend\s+API\b/gi, 'service')
    .replace(/\bBackend\s+server\b/g, 'Service')
    .replace(/\bbackend\s+server\b/gi, 'service')
    .replace(/\bBackend\b/g, 'Service')
    .replace(/\bbackend\b/gi, 'service')
    .replace(/\btransaction hash\b/gi, 'transaction ID')
    .replace(/\bclaim topics?\b/gi, (match) => match.toLowerCase().endsWith('s') ? 'verification requirements' : 'verification requirement')
    .replace(/\bidentity registry\b/gi, 'approved investor registry')
    .replace(/\badd(?:ed|ing)? to (?:the )?registry\b/gi, 'approve investor')
    .replace(/\bONCHAINID\b/g, 'technical identity reference')
    .replace(/\bdeployment transaction\b/gi, 'token-creation transaction')
    .replace(/\bdeployment\b/gi, 'token creation')
    .replace(/\bgas fee\b/gi, 'network fee')
    .replace(/\s*Version:\s*@?(?:viem|wagmi)(?:\/core)?@[^\s]+.*$/i, '')
    .replace(/\s*Docs:\s*https?:\/\/\S+.*$/i, '')
    .trim();

  // Guard against any unknown future provider format accidentally leaking a
  // large diagnostic payload into the UI.
  if (!sanitized || sanitized.length > 420 || /\n|\r/.test(sanitized)) {
    return fallback;
  }

  return sanitized;
};

export const getErrorMessage = (error, fallback = DEFAULT_PUBLIC_ERROR) => {
  const chainMessage = CHAIN_ERROR_MESSAGES[apiErrorCode(error)];
  if (chainMessage) return chainMessage;
  if (error?.userMessage) return sanitizeUserFacingMessage(error.userMessage, fallback);

  if (error?.response?.status === 429) {
    const retryAfterMs = getRetryAfterMs(error);
    const retryHint = Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? ` Try again in about ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds.`
      : ' Please wait a moment and try again.';
    return error?.__retryExhausted
      ? `The service is temporarily busy. We retried automatically, but the request is still rate limited.${retryHint}`
      : `The service is temporarily busy.${retryHint}`;
  }

  const timeoutMessage = String(error?.message || '');
  const isTimeout =
    !error?.response &&
    (error?.code === 'ECONNABORTED' ||
      error?.code === 'ETIMEDOUT' ||
      /timeout(?: of)? \d+ms exceeded|timed out/i.test(timeoutMessage));

  if (isTimeout) {
    return 'The request is taking longer than expected. Refresh to check the latest status before trying again.';
  }

  if (!error?.response && error?.code === 'ERR_NETWORK') {
    return "We're experiencing a temporary issue. Please try again in a few moments.";
  }

  const payload = error?.response?.data;
  return sanitizeUserFacingMessage(
    payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ||
      firstValidationMessage(payload?.errors) ||
      error?.shortMessage ||
      error?.details ||
      error?.message ||
      error?.cause?.shortMessage ||
      error?.cause?.details ||
      error?.cause?.message ||
      fallback,
    fallback,
  );
};

export const getApiFieldErrors = (error) => {
  const payload = error?.response?.data;
  const details = payload?.error?.details ?? payload?.errors;
  const normalizedDetails = Array.isArray(details)
    ? details
    : details && typeof details === 'object'
      ? Object.entries(details).flatMap(([field, messages]) =>
          (Array.isArray(messages) ? messages : [messages]).map((message) => ({
            field,
            message: typeof message === 'string' ? message : message?.message,
          })),
        )
      : [];

  return normalizedDetails
    .map((item) => ({
      field: String(item?.field || '')
        .replace(/^body\./, '')
        .replace(/\[(\d+)\]/g, '.$1'),
      message: sanitizeUserFacingMessage(item?.message || item?.msg || ''),
    }))
    .filter((item) => item.field && item.message);
};

export const applyApiFieldErrors = (error, setError, fieldMap = {}) => {
  const fieldErrors = getApiFieldErrors(error);
  fieldErrors.forEach(({ field, message }) => {
    const normalizedField = field
      .replace(/^owners\.(\d+)\./, 'beneficialOwners.$1.')
      .replace(/^beneficialOwners\.(\d+)\.nationalityCountryUid$/, 'beneficialOwners.$1.nationality');
    const target = fieldMap[normalizedField] || fieldMap[field] || normalizedField;
    setError(target, { type: 'server', message });
  });
  return fieldErrors.length > 0;
};
