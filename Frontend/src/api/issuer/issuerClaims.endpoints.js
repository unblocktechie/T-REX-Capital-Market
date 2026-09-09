const segment = (value) => encodeURIComponent(String(value || '').trim());

export const ISSUER_CLAIM_ENDPOINTS = Object.freeze({
  sign: '/issuer/claims/sign',
  verification: (subscriptionId) => `/issuer/claims/${segment(subscriptionId)}`,
});
