import { apiClient } from '@/api/axios';
import { ISSUER_CLAIM_ENDPOINTS } from './issuerClaims.endpoints';

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

const requiredSubscriptionId = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error('Subscription identifier is required.');
  return normalized;
};

const normalizeClaims = (claims) => {
  if (!Array.isArray(claims) || !claims.length) {
    throw new Error('At least one signed claim is required.');
  }

  return claims.map((claim, index) => {
    const claimTopic = Number(claim?.claimTopic);
    const data = String(claim?.data || '').trim();
    const signature = String(claim?.signature || '').trim();

    if (!Number.isSafeInteger(claimTopic) || claimTopic < 0) {
      throw new Error(`Claim ${index + 1} has an invalid claim topic.`);
    }
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
      throw new Error(`Claim ${index + 1} has invalid claim data.`);
    }
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new Error(`Claim ${index + 1} has an invalid signature.`);
    }

    return { claimTopic, data, signature };
  });
};

export const issuerClaimsApi = Object.freeze({
  submitSignatures(subscriptionId, claims) {
    return apiClient
      .post(
        ISSUER_CLAIM_ENDPOINTS.sign,
        {
          subscriptionId: requiredSubscriptionId(subscriptionId),
          claims: normalizeClaims(claims),
        },
        { skipGlobalLoader: true },
      )
      .then(unwrap);
  },

  getVerification(subscriptionId) {
    return apiClient
      .get(ISSUER_CLAIM_ENDPOINTS.verification(requiredSubscriptionId(subscriptionId)), {
        skipGlobalLoader: true,
      })
      .then(unwrap);
  },
});
