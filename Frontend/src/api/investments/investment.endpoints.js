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
  tokenRedemptions: (tokenUid) => `/investments/tokens/${segment(tokenUid)}/redemptions`,
  redemption: (redemptionUid) => `/investments/redemptions/${segment(redemptionUid)}`,
  authorizeRedemption: (redemptionUid) =>
    `/investments/redemptions/${segment(redemptionUid)}/authorize`,
  cancelRedemption: (redemptionUid) =>
    `/investments/redemptions/${segment(redemptionUid)}/cancel`,
  issuerRedemptions: '/investments/issuer/redemptions',
  issuerRedemption: (redemptionUid) => `/investments/issuer/redemptions/${segment(redemptionUid)}`,
  approveIssuerRedemption: (redemptionUid) =>
    `/investments/issuer/redemptions/${segment(redemptionUid)}/approve`,
  rejectIssuerRedemption: (redemptionUid) =>
    `/investments/issuer/redemptions/${segment(redemptionUid)}/reject`,
  confirmIssuerRedemptionPayment: (redemptionUid) =>
    `/investments/issuer/redemptions/${segment(redemptionUid)}/payment/confirm`,
  myInterests: '/investments/me/interests',
  myPortfolio: '/investments/me/portfolio',
  myInterestHistory: (interestUid) => `/investments/me/interests/${segment(interestUid)}/history`,
  issuerInvestors: '/investments/issuer/investors',
  issuerInvestorInvitations: (investorUid) =>
    `/investments/issuer/investors/${segment(investorUid)}/invitations`,
  myInvitations: '/investments/me/invitations',
  myInvitation: (invitationUid) => `/investments/me/invitations/${segment(invitationUid)}`,
  markMyInvitationViewed: (invitationUid) =>
    `/investments/me/invitations/${segment(invitationUid)}/viewed`,
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
