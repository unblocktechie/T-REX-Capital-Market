import { apiClient } from '@/api/axios';
import { assertValidTransactionHash } from '@/utils/transactionHash';
import { TOKEN_ENDPOINTS } from './token.endpoints';
import { normalizePriceHistoryQuery, normalizePriceHistoryResponse } from '@/services/price-history/priceHistory.utils';

const DEPLOYMENT_IDEMPOTENCY_KEY_MAX_LENGTH = 99;

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

const requiredText = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const normalizeChainId = (value) => {
  const chainId = Number(value);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('A valid blockchain chain ID is required.');
  }
  return chainId;
};

const normalizeDeploymentAttemptUid = (value) =>
  requiredText(value, 'Deployment attempt identifier');

const normalizeCurrentTokenPrice = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized) || !/[1-9]/.test(normalized)) {
    throw new Error('Current price must be greater than zero and use no more than 18 decimal places.');
  }
  const [wholeRaw = '0', fraction = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  return fraction ? `${whole}.${fraction}` : whole;
};

const normalizeDeploymentIdempotencyKey = (value) => {
  const normalized = requiredText(value, 'Deployment idempotency key');
  if (normalized.length > DEPLOYMENT_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new Error(
      `Deployment idempotency key must be ${DEPLOYMENT_IDEMPOTENCY_KEY_MAX_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
};

export const tokenApi = Object.freeze({
  getOptions: () =>
    apiClient
      .get(TOKEN_ENDPOINTS.options, { skipGlobalLoader: true })
      .then(unwrap),

  getMyToken: () =>
    apiClient
      .get(TOKEN_ENDPOINTS.me, { skipGlobalLoader: true })
      .then(unwrap),

  saveInformation: (formData, onUploadProgress) =>
    apiClient
      .put(TOKEN_ENDPOINTS.information, formData, {
        skipGlobalLoader: true,
        timeout: 60_000,
        onUploadProgress,
      })
      .then(unwrap),

  getImage: (signal) =>
    apiClient
      .get(TOKEN_ENDPOINTS.image, {
        responseType: 'blob',
        skipGlobalLoader: true,
        timeout: 60_000,
        ...(signal ? { signal } : {}),
      })
      .then((response) => response.data),


  prepareManualPrice: (currentTokenPrice, chainUid, signal) =>
    apiClient.post(
      TOKEN_ENDPOINTS.pricePrepare,
      { currentTokenPrice: normalizeCurrentTokenPrice(currentTokenPrice) },
      {
        skipGlobalLoader: true,
        skipSelectedChainHeader: true,
        headers: { 'Content-Type': 'application/json', 'X-Chain-Uid': requiredText(chainUid, 'Original chain UID') },
        ...(signal ? { signal } : {}),
      },
    ).then((response) => {
      if (response.status !== 200) throw new Error('The price request was not prepared.');
      return unwrap(response);
    }),

  getManualPriceUpdate: (priceUpdateUid, chainUid, signal) =>
    apiClient.get(TOKEN_ENDPOINTS.priceUpdateStatus(requiredText(priceUpdateUid, 'Price request ID')), {
      skipGlobalLoader: true, skipSelectedChainHeader: true,
      headers: { 'X-Chain-Uid': requiredText(chainUid, 'Original chain UID') },
      ...(signal ? { signal } : {}),
    }).then(unwrap),

  // The backend never treats an HTTP success as proof of cancellation. The
  // issuer must explicitly confirm that this intent was not broadcast.
  cancelManualPrice: (priceUpdateUid, chainUid, { confirmNotBroadcast = false } = {}) => {
    if (confirmNotBroadcast !== true) {
      throw new Error('Confirm that you did not sign or broadcast this transaction before cancelling.');
    }
    return apiClient.post(TOKEN_ENDPOINTS.priceCancel(requiredText(priceUpdateUid, 'Price request ID')),
      { confirmNotBroadcast: true }, {
        skipGlobalLoader: true, skipSelectedChainHeader: true,
        headers: { 'Content-Type': 'application/json', 'X-Chain-Uid': requiredText(chainUid, 'Original chain UID') },
      }).then(unwrap);
  },

  updateCurrentPrice: (currentTokenPrice, txHash, chainUid, priceUpdateUid, signal) => {
    const normalized = normalizeCurrentTokenPrice(currentTokenPrice);
    const transactionHash = assertValidTransactionHash(txHash);
    const selectedChainUid = requiredText(chainUid, 'Transaction chain UID');
    const savedIntentUid = requiredText(priceUpdateUid, 'Prepared price request ID');
    return apiClient
      .patch(
        TOKEN_ENDPOINTS.price,
        { priceUpdateUid: savedIntentUid, currentTokenPrice: normalized, txHash: transactionHash },
        {
          skipGlobalLoader: true,
          skipSelectedChainHeader: true,
          headers: { 'Content-Type': 'application/json', 'X-Chain-Uid': selectedChainUid },
          ...(signal ? { signal } : {}),
        },
      )
      .then((response) => {
        if (response.status !== 200 && response.status !== 202) {
          throw new Error(`Unexpected price verification response: HTTP ${response.status}.`);
        }
        return {
          pending: response.status === 202,
          status: response.status === 202 ? String(unwrap(response)?.status || 'PENDING') : 'CONFIRMED',
          token: response.status === 202 ? null : unwrap(response),
          priceUpdateUid: savedIntentUid,
          txHash: transactionHash,
        };
      });
  },

  // Uses the active website-session JWT (issuer or investor as authorized by the backend); never an issuer API key.
  getMyPriceHistory: (filters = {}, signal) =>
    apiClient
      .get(TOKEN_ENDPOINTS.priceHistory, {
        params: normalizePriceHistoryQuery(filters),
        skipGlobalLoader: true,
        ...(signal ? { signal } : {}),
      })
      .then((response) => normalizePriceHistoryResponse(response.data)),

  saveClaims: (payload) =>
    apiClient
      .put(TOKEN_ENDPOINTS.claims, payload, { skipGlobalLoader: true })
      .then(unwrap),

  saveCompliance: (payload) =>
    apiClient
      .put(TOKEN_ENDPOINTS.compliance, payload, { skipGlobalLoader: true })
      .then(unwrap),

  saveGovernance: (payload) =>
    apiClient
      .put(TOKEN_ENDPOINTS.governance, payload, { skipGlobalLoader: true })
      .then(unwrap),

  createDeploymentAttempt: ({
    chainId,
    walletAddress,
    idempotencyKey,
    networkName,
    metadata,
  }) =>
    apiClient
      .post(
        TOKEN_ENDPOINTS.deploymentAttempts,
        {
          chainId: normalizeChainId(chainId),
          walletAddress: requiredText(walletAddress, 'Deployment wallet address'),
          idempotencyKey: normalizeDeploymentIdempotencyKey(idempotencyKey),
          ...(networkName ? { networkName: String(networkName).trim() } : {}),
          ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
        },
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  getActiveDeploymentAttempt: () =>
    apiClient
      .get(TOKEN_ENDPOINTS.activeDeploymentAttempt, { skipGlobalLoader: true })
      .then(unwrap),

  markDeploymentAttemptSubmitted: (
    deploymentAttemptUid,
    { transactionHash, chainId, walletAddress },
  ) => {
    const normalizedAttemptUid = normalizeDeploymentAttemptUid(deploymentAttemptUid);
    const normalizedHash = assertValidTransactionHash(transactionHash);

    return apiClient
      .patch(
        TOKEN_ENDPOINTS.deploymentAttemptSubmitted(normalizedAttemptUid),
        {
          transactionHash: normalizedHash,
          chainId: normalizeChainId(chainId),
          walletAddress: requiredText(walletAddress, 'Deployment wallet address'),
        },
        { skipGlobalLoader: true },
      )
      .then(unwrap);
  },

  failDeploymentAttempt: (
    deploymentAttemptUid,
    { status, errorCode, errorMessage },
  ) => {
    const normalizedAttemptUid = normalizeDeploymentAttemptUid(deploymentAttemptUid);
    const allowedStatuses = new Set(['wallet_rejected', 'cancelled', 'failed']);
    const normalizedStatus = String(status || '').trim().toLowerCase();

    if (!allowedStatuses.has(normalizedStatus)) {
      throw new Error('A valid deployment failure status is required.');
    }

    return apiClient
      .patch(
        TOKEN_ENDPOINTS.deploymentAttemptFail(normalizedAttemptUid),
        {
          status: normalizedStatus,
          ...(errorCode ? { errorCode: String(errorCode).slice(0, 120) } : {}),
          ...(errorMessage ? { errorMessage: String(errorMessage).slice(0, 1000) } : {}),
        },
        { skipGlobalLoader: true },
      )
      .then(unwrap);
  },

  // The caller invokes finalization only after the deployment receipt, transfer activation,
  // and any required price transaction are confirmed and re-read on-chain. The backend must
  // independently verify those authoritative states and may return HTTP 202 while checking.
  submit: (values) => {
    const payload =
      values && typeof values === 'object'
        ? values
        : { transactionHash: values };
    const transactionHash = assertValidTransactionHash(payload.transactionHash);
    const deploymentAttemptUid = String(payload.deploymentAttemptUid || '').trim();

    return apiClient
      .post(
        TOKEN_ENDPOINTS.submit,
        {
          transactionHash,
          ...(deploymentAttemptUid ? { deploymentAttemptUid } : {}),
        },
        {
          skipGlobalLoader: true,
          timeout: 180_000,
        },
      )
      .then((response) => ({
        data: unwrap(response),
        body: response.data,
        httpStatus: response.status,
        ok: response.status >= 200 && response.status < 300,
        pending: response.status === 202 || response.data?.pending === true,
      }));
  },

  getDetails: (tokenAddress) =>
    apiClient
      .get(TOKEN_ENDPOINTS.details(tokenAddress), { skipGlobalLoader: true })
      .then(unwrap),
});
