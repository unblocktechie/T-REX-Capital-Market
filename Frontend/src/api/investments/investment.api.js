import { apiClient } from '@/api/axios';
import { INVESTMENT_ENDPOINTS } from './investment.endpoints';

const INTEREST_STATUS_MAP = new Map([
  ['pending', 'pending'],
  ['submitintrest', 'submitIntrest'],
  ['verifiedbyissuer', 'verifiedByIssuer'],
  ['claimsubmitted', 'claimSubmitted'],
  ['approved', 'approved'],
  ['rejected', 'rejected'],
  ['cancelled', 'cancelled'],
  ['all', 'all'],
]);
const TOKEN_STATUSES = new Set(['deployed', 'all']);
const PURCHASE_HISTORY_STATUSES = new Set([
  'all',
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'MINT_SUBMITTED',
  'COMPLETED',
  'EXPIRED',
]);

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

const responseMeta = (response, unwrapped) => response.data?.meta || unwrapped?.meta || response.meta || {};

const accept2xx = (status) => status >= 200 && status < 300;

const unwrapPurchaseResponse = (response) => {
  const data = unwrap(response);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const purchase = data.purchase && typeof data.purchase === 'object' && !Array.isArray(data.purchase)
    ? data.purchase
    : null;
  return {
    ...(purchase || {}),
    ...data,
    message: response?.data?.message || data.message || purchase?.message || '',
    requestId: response?.data?.requestId || data.requestId || purchase?.requestId || '',
    httpStatus: response?.status,
  };
};

const requiredDecimalString = (value, label) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !/[1-9]/.test(normalized)) {
    throw new Error(`${label} must be a positive decimal value.`);
  }
  return normalized;
};

const requiredUid = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const normalizePage = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
};

const normalizeLimit = (value, fallback = 12) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return fallback;
  return Math.min(number, 100);
};

const normalizeInterestStatus = (value, { optional = true } = {}) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized && optional) return '';
  const canonical = INTEREST_STATUS_MAP.get(normalized);
  if (!canonical) throw new Error('Invalid investment interest status.');
  return canonical;
};

const cleanPurchaseHistoryStatus = (value) => {
  const normalized = String(value || 'all').trim();
  const canonical = normalized.toLowerCase() === 'all' ? 'all' : normalized.toUpperCase();
  if (!PURCHASE_HISTORY_STATUSES.has(canonical)) {
    throw new Error('Invalid purchase history status.');
  }
  return canonical;
};

export const investmentApi = Object.freeze({
  async listTokens({ page = 1, limit = 12, search = '', status = 'deployed' } = {}) {
    const normalizedStatus = String(status || 'deployed').trim().toLowerCase();
    if (!TOKEN_STATUSES.has(normalizedStatus)) throw new Error('Invalid token catalogue status.');

    const response = await apiClient.get(INVESTMENT_ENDPOINTS.tokens, {
      params: {
        page: normalizePage(page),
        limit: normalizeLimit(limit),
        ...(String(search || '').trim() ? { search: String(search).trim() } : {}),
        status: normalizedStatus,
      },
      skipGlobalLoader: true,
    });

    const data = unwrap(response);
    return { data, meta: responseMeta(response, data) };
  },

  getToken: (tokenUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.token(requiredUid(tokenUid, 'Token identifier')), {
        skipGlobalLoader: true,
      })
      .then(unwrap),

  getTokenImage: (tokenUid, signal) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.tokenImage(requiredUid(tokenUid, 'Token identifier')), {
        responseType: 'blob',
        timeout: 60_000,
        signal,
        skipGlobalLoader: true,
      })
      .then((response) => response.data),

  getRequiredDocuments: (tokenUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.requiredDocuments(requiredUid(tokenUid, 'Token identifier')), {
        skipGlobalLoader: true,
      })
      .then(unwrap),

  submitInterest: (tokenUid, note = '') =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.submitInterest(requiredUid(tokenUid, 'Token identifier')),
        String(note || '').trim() ? { note: String(note).trim() } : {},
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  createTokenPurchase: (tokenUid, { tokenAmount, idempotencyKey }) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.tokenPurchases(requiredUid(tokenUid, 'Token identifier')),
        {
          tokenAmount: requiredDecimalString(tokenAmount, 'Token amount'),
          idempotencyKey: requiredUid(idempotencyKey, 'Checkout idempotency key'),
        },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapPurchaseResponse),

  async listTokenPurchases(tokenUid, { page = 1, limit = 20, search = '', status = 'all', signal } = {}) {
    const normalizedStatus = cleanPurchaseHistoryStatus(status);
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const response = await apiClient.get(
      INVESTMENT_ENDPOINTS.tokenPurchases(requiredUid(tokenUid, 'Token identifier')),
      {
        params: {
          page: normalizePage(page),
          limit: normalizeLimit(limit, 20),
          search: normalizedSearch,
          status: normalizedStatus,
        },
        signal,
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      },
    );
    const data = unwrap(response);
    return { data: Array.isArray(data) ? data : [], meta: responseMeta(response, data) };
  },

  getTokenPurchase: (purchaseUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.purchase(requiredUid(purchaseUid, 'Purchase identifier')), {
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      })
      .then(unwrapPurchaseResponse),

  confirmTokenPurchase: (purchaseUid, txHash) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.confirmPurchase(requiredUid(purchaseUid, 'Purchase identifier')),
        { txHash: requiredUid(txHash, 'Transaction hash') },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapPurchaseResponse),

  retryTokenPurchase: (purchaseUid) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.retryPurchase(requiredUid(purchaseUid, 'Purchase identifier')),
        {},
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapPurchaseResponse),

  listMyInterests: ({ status } = {}) => {
    const normalizedStatus = normalizeInterestStatus(status);
    return apiClient
      .get(INVESTMENT_ENDPOINTS.myInterests, {
        params: normalizedStatus ? { status: normalizedStatus } : undefined,
        skipGlobalLoader: true,
      })
      .then(unwrap);
  },

  getMyInterestHistory: (interestUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.myInterestHistory(requiredUid(interestUid, 'Interest identifier')), {
        skipGlobalLoader: true,
      })
      .then(unwrap),

  listIssuerInterests: ({ status = 'submitIntrest' } = {}) => {
    const normalizedStatus = normalizeInterestStatus(status, { optional: false });
    return apiClient
      .get(INVESTMENT_ENDPOINTS.issuerInterests, {
        params: { status: normalizedStatus },
        skipGlobalLoader: true,
      })
      .then(unwrap);
  },

  getIssuerInterest: (interestUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.issuerInterest(requiredUid(interestUid, 'Interest identifier')), {
        skipGlobalLoader: true,
      })
      .then(unwrap),

  getIssuerInterestHistory: (interestUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.issuerInterestHistory(requiredUid(interestUid, 'Interest identifier')), {
        skipGlobalLoader: true,
      })
      .then(unwrap),

  approveIssuerInterest: (interestUid, note = '') =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.approveIssuerInterest(requiredUid(interestUid, 'Interest identifier')),
        String(note || '').trim() ? { note: String(note).trim() } : {},
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  rejectIssuerInterest: (interestUid, payload = {}) => {
    const rejectReasonType = String(payload.rejectReasonType || '').trim().toUpperCase();
    if (!['DOC_REJECTED', 'OTHER'].includes(rejectReasonType)) {
      throw new Error('Select a valid rejection reason.');
    }

    const rejectReason = String(payload.rejectReason || '').trim();
    const rejectedClaims = Array.from(
      new Set((Array.isArray(payload.rejectedClaims) ? payload.rejectedClaims : [])
        .map((value) => String(value || '').trim().toUpperCase())
        .filter(Boolean)),
    );

    if (rejectReasonType === 'DOC_REJECTED' && !rejectedClaims.length) {
      throw new Error('Select at least one requested document claim.');
    }
    if (rejectReasonType === 'OTHER' && !rejectReason) {
      throw new Error('Add a reason for this rejection.');
    }

    return apiClient
      .post(
        INVESTMENT_ENDPOINTS.rejectIssuerInterest(requiredUid(interestUid, 'Interest identifier')),
        {
          rejectReasonType,
          rejectReason,
          ...(rejectReasonType === 'DOC_REJECTED' ? { rejectedClaims } : {}),
        },
        { skipGlobalLoader: true },
      )
      .then(unwrap);
  },

  prepareIssuerRegistryRegistration: (interestUid) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.issuerRegistryRegistration(
          requiredUid(interestUid, 'Interest identifier'),
        ),
        {},
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  getIssuerRegistryRegistration: (interestUid) =>
    apiClient
      .get(
        INVESTMENT_ENDPOINTS.issuerRegistryRegistration(
          requiredUid(interestUid, 'Interest identifier'),
        ),
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  confirmIssuerRegistryRegistration: (interestUid, registryOperationId, txHash) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.confirmIssuerRegistryRegistration(
          requiredUid(interestUid, 'Interest identifier'),
          requiredUid(registryOperationId, 'Registry operation identifier'),
        ),
        { txHash: requiredUid(txHash, 'Transaction hash') },
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  downloadIssuerDocument: (interestUid, documentUid) =>
    apiClient.get(
      INVESTMENT_ENDPOINTS.issuerDocumentDownload(
        requiredUid(interestUid, 'Interest identifier'),
        requiredUid(documentUid, 'Document identifier'),
      ),
      {
        responseType: 'blob',
        timeout: 60_000,
        skipGlobalLoader: true,
      },
    ),
});
