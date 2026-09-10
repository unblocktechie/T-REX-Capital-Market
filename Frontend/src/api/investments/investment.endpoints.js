const segment = (value) => encodeURIComponent(String(value || '').trim());

export const INVESTMENT_ENDPOINTS = Object.freeze({
  tokens: '/investments/tokens',
  token: (tokenUid) => `/investments/tokens/${segment(tokenUid)}`,
  tokenImage: (tokenUid) => `/investments/tokens/${segment(tokenUid)}/image`,
  requiredDocuments: (tokenUid) =>
    `/investments/tokens/${segment(tokenUid)}/required-documents`,
  submitInterest: (tokenUid) => `/investments/tokens/${segment(tokenUid)}/interest`,
  tokenPurchases: (tokenUid) => `/investments/tokens/${segment(tokenUid)}/purchases`,
  purchase: (purchaseUid) => `/investments/purchases/${segment(purchaseUid)}`,
  confirmPurchase: (purchaseUid) => `/investments/purchases/${segment(purchaseUid)}/confirm`,
  retryPurchase: (purchaseUid) => `/investments/purchases/${segment(purchaseUid)}/retry`,
  myInterests: '/investments/me/interests',
  myInterestHistory: (interestUid) => `/investments/me/interests/${segment(interestUid)}/history`,
  issuerInterests: '/investments/issuer/interests',
  issuerInterest: (interestUid) => `/investments/issuer/interests/${segment(interestUid)}`,
  issuerInterestHistory: (interestUid) => `/investments/issuer/interests/${segment(interestUid)}/history`,
  approveIssuerInterest: (interestUid) =>
    `/investments/issuer/interests/${segment(interestUid)}/approve`,
  rejectIssuerInterest: (interestUid) =>
    `/investments/issuer/interests/${segment(interestUid)}/reject`,
  issuerRegistryRegistration: (interestUid) =>
    `/investments/issuer/interests/${segment(interestUid)}/registry-registration`,
  confirmIssuerRegistryRegistration: (interestUid, registryOperationId) =>
    `/investments/issuer/interests/${segment(interestUid)}/registry-registration/${segment(registryOperationId)}/confirm`,
  issuerDocumentDownload: (interestUid, documentUid) =>
    `/investments/issuer/interests/${segment(interestUid)}/documents/${segment(documentUid)}/download`,
});
