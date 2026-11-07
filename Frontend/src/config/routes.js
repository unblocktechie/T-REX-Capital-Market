// Legacy operation helpers keep calling code on the canonical embedded operation page.
const investorOperationRoute = (tab, interestUid) => {
  const params = new URLSearchParams();
  if (interestUid) params.set('interestUid', interestUid);
  params.set('tab', tab);
  return `/app/asset-management?${params.toString()}`;
};

export const ROUTES = Object.freeze({
  root: '/',
  login: '/login',
  signup: '/signup',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/app/dashboard',
  marketplace: '/app/marketplace',
  marketplaceToken: (tokenId = ':tokenId') => `/app/marketplace/${tokenId}`,
  applications: '/app/applications',
  investorMyInvestment: '/app/my-investment',
  investorMyInvestmentTab: (tab = 'my-application') => `/app/my-investment?tab=${tab}`,
  assetManagement: '/app/asset-management',
  // A single entry point for the embedded investment actions. Keep the
  // application UID so the destination never selects a different holding.
  assetManagementAction: (options = {}, legacyInterestUid = '') => {
    const { interestUid = '', tokenUid = '', tab = 'invest' } = typeof options === 'string'
      ? { tab: options, interestUid: legacyInterestUid }
      : (options || {});
    const params = new URLSearchParams();
    if (interestUid) params.set('interestUid', interestUid);
    if (tokenUid) params.set('tokenUid', tokenUid);
    params.set('tab', ['invest', 'send', 'redeem'].includes(tab) ? tab : 'invest');
    return `/app/asset-management?${params.toString()}`;
  },
  walletManagement: '/app/wallet',
  issuerApiKeys: '/app/api-keys',
  applicationDetail: (interestUid = ':interestUid') => `/app/applications/${interestUid}`,
  applicationClaim: (interestUid = ':interestUid') => `/app/applications/${interestUid}/submit-claim`,
  purchaseToken: (interestUid = ':interestUid') => investorOperationRoute('invest', interestUid),
  sendToken: (interestUid = ':interestUid') => investorOperationRoute('send', interestUid),
  redeemToken: (interestUid = ':interestUid') => investorOperationRoute('redeem', interestUid),
  projects: '/app/projects',
  createToken: '/app/tokens/new',
  tokenIssuanceStep: (step = ':step') => `/app/tokens/new/${step}`,
  tokenDeploying: '/app/tokens/new/deploying',
  tokenSuccess: (tokenAddress = ':tokenAddress') => `/app/tokens/${tokenAddress}/success`,
  tokenDetails: (tokenAddress = ':tokenAddress') => `/app/tokens/${tokenAddress}`,
  tokenPriceHistory: (tokenAddress = ':tokenAddress') => `/app/tokens/${tokenAddress}/price-history`,
  identity: '/app/identity',
  compliance: '/app/compliance',
  investors: '/app/investors',
  issuerInvestorManagement: '/app/investor-management',
  issuerInvestorManagementTab: (tab = 'investors') => `/app/investor-management?tab=${tab}`,
  issuerInvestorDirectory: '/app/investor-directory',
  invitations: '/app/invitations',
  portfolio: '/app/portfolio',
  issuerRedemptions: '/app/redemptions',
  issuerRedemption: (redemptionUid = ':redemptionUid') => `/app/redemptions/${redemptionUid}`,
  transactions: '/app/transactions',
  corporateActions: '/app/corporate-actions',
  documents: '/app/documents',
  reports: '/app/reports',
  users: '/app/team',
  profile: '/app/profile',
  settings: '/app/settings',
  chainAccess: '/app/networks',
  adminRoot: '/admin',
  adminDashboard: '/admin/dashboard',
  adminReviewQueue: '/admin/reviews',
  adminOrganizations: '/admin/organizations',
  adminNetworks: '/admin/networks',
  adminIssuerApiKeySettings: '/admin/api-key-settings',
  adminTeamNotifications: '/admin/team-notifications',
  adminInvestors: '/admin/investors',
  adminInvestor: (userUid = ':userUid') => `/admin/investors/${userUid}`,
  adminTokens: '/admin/tokens',
  adminInvestorApplications: '/admin/investor-applications',
  adminOrganizationReview: (organizationId = ':organizationId') => `/admin/organizations/${organizationId}`,
  adminUsers: '/admin/users',
  adminAuditLogs: '/admin/audit-logs',
  adminSettings: '/admin/settings',
  adminProfile: '/admin/profile',
  adminDocumentation: '/admin/documentation',
  adminSecurityLogs: '/admin/security-logs',
  organization: '/app/organization',
  organizationCompany: '/app/organization/company-information',
  organizationJurisdiction: '/app/organization/jurisdiction',
  organizationUbo: '/app/organization/ubo',
  organizationDocuments: '/app/organization/documents',
  organizationReview: '/app/organization/review',
  organizationPending: '/app/organization/pending',
  organizationRejected: '/app/organization/rejected',
  organizationVerified: '/app/organization/verified',
  organizationOverview: '/app/organization/overview',
  unauthorized: '/unauthorized',
  forbidden: '/forbidden',
  networkError: '/network-error',
  notFound: '*',
});
