const segment = (value) => encodeURIComponent(String(value || '').trim());

export const INVESTMENT_ENDPOINTS = Object.freeze({
  tokens: '/investments/tokens',
  token: (tokenUid) => `/investments/tokens/${segment(tokenUid)}`,
  tokenImage: (tokenUid) => `/investments/tokens/${segment(tokenUid)}/image`,
  requiredDocuments: (tokenUid) =>
    `/investments/tokens/${segment(tokenUid)}/required-documents`,
  submitInterest: (tokenUid) => `/investments/tokens/${segment(tokenUid)}/interest`,
  myInterests: '/investments/me/interests',
  issuerInterests: '/investments/issuer/interests',
  issuerInterest: (interestUid) => `/investments/issuer/interests/${segment(interestUid)}`,
  issuerDocumentDownload: (interestUid, documentUid) =>
    `/investments/issuer/interests/${segment(interestUid)}/documents/${segment(documentUid)}/download`,
});
