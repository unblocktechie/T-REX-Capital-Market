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
const ISSUER_INVITATION_STATUSES = new Set(['all', 'notInvited', 'PENDING', 'SENT', 'VIEWED']);
const INVESTOR_INVITATION_STATUSES = new Set(['all', 'SENT', 'VIEWED']);
const PURCHASE_HISTORY_STATUSES = new Set([
  'all',
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'MINT_SUBMITTED',
  'COMPLETED',
  'EXPIRED',
]);
const TRANSFER_HISTORY_STATUSES = new Set([
  'all',
  'PENDING_TRANSFER',
  'COMPLETED',
  'EXPIRED',
  'MANUAL_REVIEW',
]);
const TRANSFER_DIRECTIONS = new Set(['all', 'sent', 'received']);
const REDEMPTION_HISTORY_STATUSES = new Set([
  'all',
  'PENDING_INVESTOR_AUTHORIZATION',
  'PENDING_ISSUER_APPROVAL',
  'TOKENS_LOCKED',
  'PAYMENT_SUBMITTED',
  'BURN_SUBMITTED',
  'COMPLETED',
  'ISSUER_REJECTED',
  'CANCELLATION_PENDING',
  'CANCELLED',
  'EXPIRED',
  'MANUAL_REVIEW',
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

const unwrapTransferResponse = (response) => {
  const data = unwrap(response);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const transfer = data.transfer && typeof data.transfer === 'object' && !Array.isArray(data.transfer)
    ? data.transfer
    : null;
  return {
    ...(transfer || {}),
    ...data,
    message: response?.data?.message || data.message || transfer?.message || '',
    requestId: response?.data?.requestId || data.requestId || transfer?.requestId || '',
    httpStatus: response?.status,
  };
};

const unwrapRedemptionResponse = (response) => {
  const data = unwrap(response);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const redemption = data.redemption && typeof data.redemption === 'object' && !Array.isArray(data.redemption)
    ? data.redemption
    : null;
  return {
    ...(redemption || {}),
    ...data,
    message: response?.data?.message || data.message || redemption?.message || '',
    requestId: response?.data?.requestId || data.requestId || redemption?.requestId || '',
    httpStatus: response?.status,
  };
};

const unwrapRegistryRegistrationResponse = (response) => {
  const data = unwrap(response);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const registration = data.registration && typeof data.registration === 'object' && !Array.isArray(data.registration)
    ? data.registration
    : data.registryRegistration && typeof data.registryRegistration === 'object' && !Array.isArray(data.registryRegistration)
      ? data.registryRegistration
      : null;
  return {
    ...(registration || {}),
    ...data,
    message: response?.data?.message || data.message || registration?.message || '',
    requestId: response?.data?.requestId || data.requestId || registration?.requestId || '',
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

const requiredSignature = (value) => {
  const normalized = String(value || '').trim();
  if (!/^0x[0-9a-fA-F]+$/.test(normalized) || normalized.length < 132) {
    throw new Error('The secure confirmation is invalid.');
  }
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

const normalizeAuthenticatedApiPath = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error('Image path is required.');
  if (/^https?:\/\//i.test(normalized)) {
    throw new Error('Only relative image paths are supported.');
  }

  const withoutQueryOrigin = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withoutQueryOrigin
    .replace(/^\/api\/v\d+(?=\/)/i, '')
    .replace(/^\/v\d+(?=\/)/i, '');
};

const normalizeInterestStatus = (value, { optional = true } = {}) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized && optional) return '';
  const canonical = INTEREST_STATUS_MAP.get(normalized);
  if (!canonical) throw new Error('Invalid investment interest status.');
  return canonical;
};

const cleanIssuerInvitationStatus = (value) => {
  const normalized = String(value || 'all').trim();
  const canonical = normalized.toLowerCase() === 'notinvited'
    ? 'notInvited'
    : normalized.toLowerCase() === 'all'
      ? 'all'
      : normalized.toUpperCase();
  if (!ISSUER_INVITATION_STATUSES.has(canonical)) throw new Error('Invalid invitation status.');
  return canonical;
};

const cleanInvestorInvitationStatus = (value) => {
  const normalized = String(value || 'all').trim();
  const canonical = normalized.toLowerCase() === 'all' ? 'all' : normalized.toUpperCase();
  if (!INVESTOR_INVITATION_STATUSES.has(canonical)) throw new Error('Invalid invitation status.');
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

const cleanTransferHistoryStatus = (value) => {
  const normalized = String(value || 'all').trim();
  const canonical = normalized.toLowerCase() === 'all' ? 'all' : normalized.toUpperCase();
  if (!TRANSFER_HISTORY_STATUSES.has(canonical)) {
    throw new Error('Invalid transfer history status.');
  }
  return canonical;
};

const cleanTransferDirection = (value) => {
  const normalized = String(value || 'all').trim().toLowerCase();
  if (!TRANSFER_DIRECTIONS.has(normalized)) throw new Error('Invalid transfer direction.');
  return normalized;
};

const cleanRedemptionHistoryStatus = (value) => {
  const normalized = String(value || 'all').trim();
  const canonical = normalized.toLowerCase() === 'all' ? 'all' : normalized.toUpperCase();
  if (!REDEMPTION_HISTORY_STATUSES.has(canonical)) {
    throw new Error('Invalid redemption history status.');
  }
  return canonical;
};


const TRANSACTION_ACTIONS = new Set(['INVEST', 'TRANSFER', 'REDEMPTION']);
const TRANSACTION_STATUSES = new Set(['SUBMITTED', 'CONFIRMED', 'FAILED']);

const requiredTransactionHash = (value) => {
  const normalized = String(value || '').trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) throw new Error('Confirmation ID is invalid.');
  return normalized;
};

const requiredTransactionAction = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!TRANSACTION_ACTIONS.has(normalized)) throw new Error('The requested action is invalid.');
  return normalized;
};

const cleanTransactionStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized || normalized === 'ALL') return '';
  if (!TRANSACTION_STATUSES.has(normalized)) throw new Error('Activity status is invalid.');
  return normalized;
};

const unwrapTransactionResponse = (response) => {
  const data = unwrap(response);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const transaction = data.transaction && typeof data.transaction === 'object' && !Array.isArray(data.transaction)
    ? data.transaction
    : data.row && typeof data.row === 'object' && !Array.isArray(data.row)
      ? data.row
      : null;
  return {
    ...(transaction || {}),
    ...data,
    status: data.status || transaction?.status || '',
    transactionHash: data.transactionHash || data.txHash || transaction?.transactionHash || transaction?.txHash || '',
    httpStatus: response?.status,
  };
};

const transactionRows = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['items', 'rows', 'transactions', 'results', 'data']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
};

const dedupeTransactionRows = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    const chainId = String(row?.chainId ?? '');
    const hash = String(row?.transactionHash || row?.txHash || '').trim().toLowerCase();
    const type = String(row?.type || row?.action || '').trim().toUpperCase();
    if (!hash) return true;
    const key = `${chainId}:${hash}:${type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const investmentApi = Object.freeze({

  confirmObservedTransaction: ({ chainId, txHash, tokenUid, expectedAction }) => {
    const parsedChainId = Number(chainId);
    if (!Number.isSafeInteger(parsedChainId) || parsedChainId <= 0) throw new Error('Chain identifier is invalid.');
    return apiClient
      .post(
        INVESTMENT_ENDPOINTS.confirmTransaction,
        {
          chainId: parsedChainId,
          txHash: requiredTransactionHash(txHash),
          tokenUid: requiredUid(tokenUid, 'Token identifier'),
          expectedAction: requiredTransactionAction(expectedAction),
        },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapTransactionResponse);
  },

  async listTransactions({ page = 1, limit = 20, tokenUid = '', type = '', status = '', walletAddress = '', txHash = '', fromDate = '', toDate = '', search = '', signal } = {}) {
    const normalizedType = String(type || '').trim().toUpperCase();
    if (normalizedType && normalizedType !== 'ALL' && !TRANSACTION_ACTIONS.has(normalizedType)) throw new Error('Activity type is invalid.');
    const normalizedStatus = cleanTransactionStatus(status);
    const response = await apiClient.get(INVESTMENT_ENDPOINTS.transactions, {
      params: {
        page: normalizePage(page),
        limit: normalizeLimit(limit, 20),
        ...(String(tokenUid || '').trim() ? { tokenUid: String(tokenUid).trim() } : {}),
        ...(normalizedType && normalizedType !== 'ALL' ? { type: normalizedType } : {}),
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
        ...(String(walletAddress || '').trim() ? { walletAddress: String(walletAddress).trim() } : {}),
        ...(String(txHash || '').trim() ? { txHash: String(txHash).trim() } : {}),
        ...(String(fromDate || '').trim() ? { fromDate: String(fromDate).trim() } : {}),
        ...(String(toDate || '').trim() ? { toDate: String(toDate).trim() } : {}),
        ...(String(search || '').trim() ? { search: String(search).trim().slice(0, 120) } : {}),
      },
      signal,
      skipGlobalLoader: true,
      validateStatus: accept2xx,
    });
    const data = unwrap(response);
    return { data: dedupeTransactionRows(transactionRows(data)), meta: responseMeta(response, data) };
  },

  exportTransactions: ({ tokenUid = '', type = '', status = '', walletAddress = '', txHash = '', fromDate = '', toDate = '', search = '' } = {}) => {
    const normalizedType = String(type || '').trim().toUpperCase();
    const normalizedStatus = cleanTransactionStatus(status);
    return apiClient.get(INVESTMENT_ENDPOINTS.exportTransactions, {
      params: {
        ...(String(tokenUid || '').trim() ? { tokenUid: String(tokenUid).trim() } : {}),
        ...(normalizedType && normalizedType !== 'ALL' ? { type: normalizedType } : {}),
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
        ...(String(walletAddress || '').trim() ? { walletAddress: String(walletAddress).trim() } : {}),
        ...(String(txHash || '').trim() ? { txHash: String(txHash).trim() } : {}),
        ...(String(fromDate || '').trim() ? { fromDate: String(fromDate).trim() } : {}),
        ...(String(toDate || '').trim() ? { toDate: String(toDate).trim() } : {}),
        ...(String(search || '').trim() ? { search: String(search).trim().slice(0, 120) } : {}),
      },
      responseType: 'blob',
      timeout: 60_000,
      skipGlobalLoader: true,
      validateStatus: accept2xx,
    }).then((response) => ({ blob: response.data, headers: response.headers }));
  },

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

  getAuthenticatedImage: (imageUrl, signal) =>
    apiClient
      .get(normalizeAuthenticatedApiPath(imageUrl), {
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

  getTokenTransfer: (transferUid, { signal } = {}) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.transfer(requiredUid(transferUid, 'Transfer identifier')), {
        signal,
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      })
      .then(unwrapTransferResponse),

  async listTokenTransfers(tokenUid, { page = 1, limit = 20, search = '', status = 'all', direction = 'all', signal } = {}) {
    const normalizedStatus = cleanTransferHistoryStatus(status);
    const normalizedDirection = cleanTransferDirection(direction);
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const response = await apiClient.get(
      INVESTMENT_ENDPOINTS.tokenTransfers(requiredUid(tokenUid, 'Token identifier')),
      {
        params: {
          page: normalizePage(page),
          limit: normalizeLimit(limit, 20),
          search: normalizedSearch,
          status: normalizedStatus,
          direction: normalizedDirection,
        },
        signal,
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      },
    );
    const data = unwrap(response);
    const transfers = Array.isArray(data)
      ? data
      : Array.isArray(data?.transfers)
        ? data.transfers
        : [];
    return { data: transfers, meta: responseMeta(response, data) };
  },

  createTokenRedemption: (tokenUid, { tokenAmount, idempotencyKey }) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.tokenRedemptions(requiredUid(tokenUid, 'Token identifier')),
        {
          tokenAmount: requiredDecimalString(tokenAmount, 'Redeem amount'),
          idempotencyKey: requiredUid(idempotencyKey, 'Redemption idempotency key'),
        },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapRedemptionResponse),

  getTokenRedemption: (redemptionUid, { signal } = {}) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.redemption(requiredUid(redemptionUid, 'Redemption identifier')), {
        signal,
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      })
      .then(unwrapRedemptionResponse),

  authorizeTokenRedemption: (redemptionUid, signature) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.authorizeRedemption(requiredUid(redemptionUid, 'Redemption identifier')),
        { signature: requiredSignature(signature) },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapRedemptionResponse),

  cancelTokenRedemption: (redemptionUid) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.cancelRedemption(requiredUid(redemptionUid, 'Redemption identifier')),
        undefined,
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapRedemptionResponse),

  async listTokenRedemptions(tokenUid, { page = 1, limit = 20, search = '', status = 'all', signal } = {}) {
    const normalizedStatus = cleanRedemptionHistoryStatus(status);
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const response = await apiClient.get(
      INVESTMENT_ENDPOINTS.tokenRedemptions(requiredUid(tokenUid, 'Token identifier')),
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


  async listIssuerRedemptions({ signal } = {}) {
    const response = await apiClient.get(INVESTMENT_ENDPOINTS.issuerRedemptions, {
      signal,
      skipGlobalLoader: true,
      validateStatus: accept2xx,
    });
    const data = unwrap(response);
    const items = Array.isArray(data)
      ? data
      : data?.items || data?.rows || data?.redemptions || data?.results || [];
    return { data: Array.isArray(items) ? items : [], meta: responseMeta(response, data) };
  },

  getIssuerRedemption: (redemptionUid, { signal } = {}) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.issuerRedemption(requiredUid(redemptionUid, 'Redemption identifier')), {
        signal,
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      })
      .then(unwrapRedemptionResponse),

  approveIssuerRedemption: (redemptionUid) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.approveIssuerRedemption(requiredUid(redemptionUid, 'Redemption identifier')),
        {},
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapRedemptionResponse),

  rejectIssuerRedemption: (redemptionUid, reason) => {
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) throw new Error('A rejection reason is required.');

    return apiClient
      .post(
        INVESTMENT_ENDPOINTS.rejectIssuerRedemption(requiredUid(redemptionUid, 'Redemption identifier')),
        { reason: normalizedReason },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapRedemptionResponse);
  },

  async listIssuerInvestors({ tokenUid, page = 1, limit = 20, search = '', invitationStatus = 'all', signal } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = cleanIssuerInvitationStatus(invitationStatus);
    const response = await apiClient.get(INVESTMENT_ENDPOINTS.issuerInvestors, {
      params: {
        tokenUid: requiredUid(tokenUid, 'Token identifier'),
        page: normalizePage(page),
        limit: normalizeLimit(limit, 20),
        search: normalizedSearch,
        invitationStatus: normalizedStatus,
      },
      signal,
      skipGlobalLoader: true,
      validateStatus: accept2xx,
    });
    const data = unwrap(response);
    const meta = responseMeta(response, data);
    return { data, meta: Object.keys(meta || {}).length ? meta : data?.pagination || response.data?.pagination || {} };
  },

  sendIssuerInvestorInvitation: (investorUid, tokenUid) =>
    apiClient
      .post(
        INVESTMENT_ENDPOINTS.issuerInvestorInvitations(requiredUid(investorUid, 'Investor identifier')),
        { tokenUid: requiredUid(tokenUid, 'Token identifier') },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then((response) => {
        const data = unwrap(response);
        const invitation = data?.invitation && typeof data.invitation === 'object' ? data.invitation : null;
        return {
          ...(invitation || {}),
          ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
          httpStatus: response.status,
        };
      }),

  async listMyInvitations({ page = 1, limit = 20, search = '', status = 'all', signal } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = cleanInvestorInvitationStatus(status);
    const response = await apiClient.get(INVESTMENT_ENDPOINTS.myInvitations, {
      params: {
        page: normalizePage(page),
        limit: normalizeLimit(limit, 20),
        search: normalizedSearch,
        status: normalizedStatus,
      },
      signal,
      skipGlobalLoader: true,
      validateStatus: accept2xx,
    });
    const data = unwrap(response);
    const meta = responseMeta(response, data);
    return { data, meta: Object.keys(meta || {}).length ? meta : data?.pagination || response.data?.pagination || {} };
  },

  getMyInvitation: (invitationUid) =>
    apiClient
      .get(INVESTMENT_ENDPOINTS.myInvitation(requiredUid(invitationUid, 'Invitation identifier')), {
        skipGlobalLoader: true,
        validateStatus: accept2xx,
      })
      .then(unwrap),

  markMyInvitationViewed: (invitationUid) =>
    apiClient
      .patch(
        INVESTMENT_ENDPOINTS.markMyInvitationViewed(requiredUid(invitationUid, 'Invitation identifier')),
        {},
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrap),

  async listMyPortfolio({ page = 1, limit = 20, search = '', signal } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const response = await apiClient.get(INVESTMENT_ENDPOINTS.myPortfolio, {
      params: {
        page: normalizePage(page),
        limit: normalizeLimit(limit, 20),
        search: normalizedSearch,
      },
      signal,
      skipGlobalLoader: true,
      validateStatus: accept2xx,
    });
    const data = unwrap(response);
    const meta = responseMeta(response, data);
    return {
      data,
      meta: Object.keys(meta || {}).length
        ? meta
        : data?.pagination || response.data?.pagination || {},
    };
  },

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
      .then(unwrapRegistryRegistrationResponse),

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
        { txHash: requiredUid(txHash, 'Confirmation ID') },
        { skipGlobalLoader: true },
      )
      .then(unwrapRegistryRegistrationResponse),

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
