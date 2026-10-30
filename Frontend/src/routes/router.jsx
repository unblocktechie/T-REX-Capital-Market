import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter, useLocation, useParams } from 'react-router-dom';
import { WorkspaceRouteLoader } from '@/components/loaders/DelayedTrexLoader';
import { AdminPageSkeleton, WorkspacePageSkeleton } from '@/components/loaders/WorkspacePageSkeleton';
import { TokenCreationAccessGuard } from '@/components/token-issuance/TokenCreationAccessGuard';
import {
  OrganizationDataGuard,
  OrganizationEditableGuard,
} from '@/components/organization/OrganizationRouteGuards';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { AuthLayout } from '@/layouts/AuthLayout';
import { MainLayout } from '@/layouts/MainLayout';
import { AdminLayout } from '@/layouts/admin/AdminLayout';
import { AuthMiddleware } from '@/middleware/AuthMiddleware';
import { GuestMiddleware } from '@/middleware/GuestMiddleware';
import { OrganizationAccessMiddleware } from '@/middleware/OrganizationAccessMiddleware';
import { RoleMiddleware } from '@/middleware/RoleMiddleware';
import { SelectedChainBootstrapMiddleware } from '@/middleware/SelectedChainBootstrapMiddleware';
import { WorkspaceMiddleware } from '@/middleware/WorkspaceMiddleware';
import { useAuth } from '@/hooks/useAuth';
import { useInvestorAccessStatus } from '@/hooks/useInvestorAccessStatus';
import { resolveAuthenticatedLandingRoute } from '@/services/auth-landing.service';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ChainAccessPage = lazy(() => import('@/pages/common/ChainAccessPage')); 
const InvestorsRoutePage = lazy(() => import('@/pages/investors/InvestorsRoutePage'));
const IssuerInvestorSubscriptionReviewPage = lazy(() => import('@/pages/issuer/IssuerInvestorSubscriptionReviewPage'));
const IssuerInvestorManagementPage = lazy(() => import('@/pages/issuer/IssuerInvestorManagementPage'));
const IssuerTransactionHistoryPage = lazy(() => import('@/pages/issuer/IssuerTransactionHistoryPage'));
const IssuerRedemptionDetailPage = lazy(() => import('@/pages/issuer/IssuerRedemptionDetailPage'));
const MarketplacePage = lazy(() => import('@/pages/investor-portal/MarketplacePage'));
const InvestorMyInvestmentPage = lazy(() => import('@/pages/investor-portal/InvestorMyInvestmentPage'));
const MarketplaceTokenDetailsPage = lazy(() => import('@/pages/investor-portal/MarketplaceTokenDetailsPage'));
const AssetManagementPage = lazy(() => import('@/pages/investor-portal/AssetManagementPage'));
const WalletManagementPage = lazy(() => import('@/pages/wallet/WalletManagementPage'));
const ApplicationDetailsPage = lazy(() => import('@/pages/investor-portal/ApplicationDetailsPage'));
const SubmitClaimPage = lazy(() => import('@/pages/investor-portal/SubmitClaimPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'));
const ForbiddenPage = lazy(() => import('@/pages/errors/ForbiddenPage'));
const UnauthorizedPage = lazy(() => import('@/pages/errors/UnauthorizedPage'));
const NetworkErrorPage = lazy(() => import('@/pages/errors/NetworkErrorPage'));
const TokenIssuanceOverviewPage = lazy(() => import('@/pages/tokens/TokenIssuanceOverviewPage'));
const TokenInformationPage = lazy(() => import('@/pages/tokens/TokenInformationPage'));
const IdentityClaimsPage = lazy(() => import('@/pages/tokens/IdentityClaimsPage'));
const ComplianceRulesPage = lazy(() => import('@/pages/tokens/ComplianceRulesPage'));
const AgentsPage = lazy(() => import('@/pages/tokens/AgentsPage'));
const ReviewDeployPage = lazy(() => import('@/pages/tokens/ReviewDeployPage'));
const DeploymentProcessingPage = lazy(() => import('@/pages/tokens/DeploymentProcessingPage'));
const DeploymentSuccessPage = lazy(() => import('@/pages/tokens/DeploymentSuccessPage'));
const TokenDetailsPage = lazy(() => import('@/pages/tokens/TokenDetailsPage'));
const OrganizationEntryPage = lazy(() => import('@/pages/organization/OrganizationEntryPage'));
const CompanyInformationPage = lazy(() => import('@/pages/organization/CompanyInformationPage'));
const JurisdictionPage = lazy(() => import('@/pages/organization/JurisdictionPage'));
const BeneficialOwnersPage = lazy(() => import('@/pages/organization/BeneficialOwnersPage'));
const DocumentationPage = lazy(() => import('@/pages/organization/DocumentationPage'));
const ReviewSubmissionPage = lazy(() => import('@/pages/organization/ReviewSubmissionPage'));
const VerificationPendingPage = lazy(() => import('@/pages/organization/VerificationPendingPage'));
const VerificationRejectedPage = lazy(() => import('@/pages/organization/VerificationRejectedPage'));
const OrganizationVerifiedPage = lazy(() => import('@/pages/organization/OrganizationVerifiedPage'));
const OrganizationOverviewPage = lazy(() => import('@/pages/organization/OrganizationOverviewPage'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const ReviewQueuePage = lazy(() => import('@/pages/admin/ReviewQueuePage'));
const AdminOrganizationsPage = lazy(() => import('@/pages/admin/AdminOrganizationsPage'));
const AdminNetworksPage = lazy(() => import('@/pages/admin/AdminNetworksPage')); 
const OrganizationReviewPage = lazy(() => import('@/pages/admin/OrganizationReviewPage'));
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage'));

function InvestorMyInvestmentLegacyRedirect({ tab }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', tab);
  return (
    <Navigate
      to={{ pathname: ROUTES.investorMyInvestment, search: `?${params.toString()}` }}
      replace
      state={location.state}
    />
  );
}

// Old transaction links stay valid, but the standalone page is no longer
// rendered. Preserve any other query params and navigation state on redirect.
function LegacyInvestorOperationRedirect({ tab }) {
  const { interestUid } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.delete('tokenUid');
  params.set('tab', tab);
  if (interestUid) params.set('interestUid', interestUid);
  return (
    <Navigate
      to={{ pathname: ROUTES.assetManagement, search: `?${params.toString()}`, hash: location.hash }}
      replace
      state={location.state}
    />
  );
}

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  const investorAccess = useInvestorAccessStatus(
    user?.role === ROLES.investor ? user : null,
  );
  const destination = !isAuthenticated
    ? ROUTES.login
    : user?.role === ROLES.investor && !investorAccess.isWorkspaceUnlocked
      ? ROUTES.investors
      : resolveAuthenticatedLandingRoute(user?.role);

  // Keep the shared minimal loader visible while the redirect is pending.
  return (
    <>
      <WorkspaceRouteLoader />
      <Navigate to={destination} replace />
    </>
  );
}

const withSuspense = (element) => (
  <Suspense fallback={<WorkspaceRouteLoader />}>
    {element}
  </Suspense>
);

// Once the authenticated shell is mounted, keep it visible during lazy-route
// loading. The page-specific skeleton takes over when the route component mounts.
const withWorkspaceSuspense = (element) => (
  <Suspense fallback={<WorkspacePageSkeleton />}>
    {element}
  </Suspense>
);

const withAdminSuspense = (element) => (
  <Suspense fallback={<AdminPageSkeleton />}>
    {element}
  </Suspense>
);

export const router = createBrowserRouter([
  { path: ROUTES.root, element: <HomeRedirect /> },
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestMiddleware />,
        children: [
          { path: ROUTES.login, element: withSuspense(<LoginPage />) },
          { path: ROUTES.signup, element: withSuspense(<SignupPage />) },
          { path: ROUTES.forgotPassword, element: withSuspense(<ForgotPasswordPage />) },
        ],
      },
      { path: ROUTES.verifyEmail, element: withSuspense(<VerifyEmailPage />) },
      { path: ROUTES.resetPassword, element: withSuspense(<ResetPasswordPage />) },
    ],
  },
  {
    element: <AuthMiddleware />,
    children: [
      {
        element: <RoleMiddleware roles={[ROLES.admin]} />,
        children: [
          {
            path: ROUTES.adminRoot,
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to={ROUTES.adminReviewQueue} replace /> },
              { path: 'dashboard', element: withAdminSuspense(<AdminDashboardPage />) },
              { path: 'reviews', element: withAdminSuspense(<ReviewQueuePage />) },
              { path: 'organizations', element: withAdminSuspense(<AdminOrganizationsPage />) },
              { path: 'networks', element: withAdminSuspense(<AdminNetworksPage />) },
              { path: 'organizations/:organizationId', element: withAdminSuspense(<OrganizationReviewPage />) },
              { path: 'profile', element: withAdminSuspense(<AdminProfilePage />) },
              { path: 'users', element: <Navigate to={ROUTES.adminReviewQueue} replace /> },
              { path: 'audit-logs', element: <Navigate to={ROUTES.adminReviewQueue} replace /> },
              { path: 'settings', element: <Navigate to={ROUTES.adminReviewQueue} replace /> },
              { path: 'documentation', element: <Navigate to={ROUTES.adminReviewQueue} replace /> },
              { path: 'security-logs', element: <Navigate to={ROUTES.adminReviewQueue} replace /> },
            ],
          },
        ],
      },
      {
        element: <WorkspaceMiddleware />,
        children: [
          {
            path: '/app',
            element: (
              <SelectedChainBootstrapMiddleware>
                <MainLayout />
              </SelectedChainBootstrapMiddleware>
            ),
            children: [
          {
            element: <OrganizationAccessMiddleware />,
            children: [
              { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
              { path: 'dashboard', element: withWorkspaceSuspense(<DashboardPage />) },
              { path: 'networks', element: withWorkspaceSuspense(<ChainAccessPage />) },
              { path: 'investors', element: withWorkspaceSuspense(<InvestorsRoutePage />) },
              { path: 'wallet', element: withWorkspaceSuspense(<WalletManagementPage />) },
              {
                element: <RoleMiddleware roles={[ROLES.issuer]} />,
                children: [
                  // `/app/tokens` is the natural breadcrumb destination, but there is no
                  // standalone token-list page for issuers. Route it through the existing
                  // token entry point so the creation guard can send issuers to the correct
                  // wizard/review/deploying/token-details screen instead of a 404.
                  { path: 'tokens', element: <Navigate to={ROUTES.createToken} replace /> },
                  {
                    element: <TokenCreationAccessGuard />,
                    children: [
                      { path: 'tokens/new', element: withWorkspaceSuspense(<TokenIssuanceOverviewPage />) },
                      { path: 'tokens/new/token-information', element: withWorkspaceSuspense(<TokenInformationPage />) },
                      { path: 'tokens/new/supply-pricing', element: <Navigate to={ROUTES.tokenIssuanceStep('token-information')} replace /> },
                      { path: 'tokens/new/identity-claims', element: withWorkspaceSuspense(<IdentityClaimsPage />) },
                      { path: 'tokens/new/compliance', element: withWorkspaceSuspense(<ComplianceRulesPage />) },
                      { path: 'tokens/new/agents', element: withWorkspaceSuspense(<AgentsPage />) },
                      { path: 'tokens/new/review', element: withWorkspaceSuspense(<ReviewDeployPage />) },
                      { path: 'tokens/new/deploying', element: withWorkspaceSuspense(<DeploymentProcessingPage />) },
                    ],
                  },
                  { path: 'tokens/:tokenAddress/success', element: withWorkspaceSuspense(<DeploymentSuccessPage />) },
                  { path: 'tokens/:tokenAddress', element: withWorkspaceSuspense(<TokenDetailsPage />) },
                  { path: 'investors/:requestId', element: withWorkspaceSuspense(<IssuerInvestorSubscriptionReviewPage />) },
                  { path: 'investor-management', element: withWorkspaceSuspense(<IssuerInvestorManagementPage />) },
                  { path: 'investor-directory', element: <Navigate to={ROUTES.issuerInvestorManagementTab('investors')} replace /> },
                  { path: 'transactions', element: withWorkspaceSuspense(<IssuerTransactionHistoryPage />) },
                  { path: 'redemptions', element: <Navigate to={ROUTES.issuerInvestorManagementTab('redemption-requests')} replace /> },
                  { path: 'redemptions/:redemptionUid', element: withWorkspaceSuspense(<IssuerRedemptionDetailPage />) },
                ],
              },
              {
                element: <RoleMiddleware roles={[ROLES.investor]} />,
                children: [
                  { path: 'marketplace', element: withWorkspaceSuspense(<MarketplacePage />) },
                  { path: 'marketplace/:tokenId', element: withWorkspaceSuspense(<MarketplaceTokenDetailsPage />) },
                  { path: 'my-investment', element: withWorkspaceSuspense(<InvestorMyInvestmentPage />) },
                  { path: 'invitations', element: <InvestorMyInvestmentLegacyRedirect tab="invitation" /> },
                  { path: 'applications', element: <InvestorMyInvestmentLegacyRedirect tab="my-application" /> },
                  { path: 'portfolio', element: <InvestorMyInvestmentLegacyRedirect tab="portfolio" /> },
                  { path: 'asset-management', element: withWorkspaceSuspense(<AssetManagementPage />) },
                  { path: 'transactions', element: <Navigate to={ROUTES.dashboard} replace /> },
                  { path: 'applications/:interestUid', element: withWorkspaceSuspense(<ApplicationDetailsPage />) },
                  { path: 'applications/:interestUid/submit-claim', element: withWorkspaceSuspense(<SubmitClaimPage />) },
                  { path: 'applications/:interestUid/purchase', element: <LegacyInvestorOperationRedirect tab="invest" /> },
                  { path: 'applications/:interestUid/send', element: <LegacyInvestorOperationRedirect tab="send" /> },
                  { path: 'applications/:interestUid/redeem', element: <LegacyInvestorOperationRedirect tab="redeem" /> },
                ],
              },
              {
                element: <RoleMiddleware roles={[ROLES.issuer]} />,
                children: [
                  {
                    element: <OrganizationDataGuard />,
                    children: [
                      { path: 'organization', element: withWorkspaceSuspense(<OrganizationEntryPage />) },
                      {
                        element: <OrganizationEditableGuard />,
                        children: [
                          { path: 'organization/company-information', element: withWorkspaceSuspense(<CompanyInformationPage />) },
                          { path: 'organization/jurisdiction', element: withWorkspaceSuspense(<JurisdictionPage />) },
                          { path: 'organization/ubo', element: withWorkspaceSuspense(<BeneficialOwnersPage />) },
                          { path: 'organization/documents', element: withWorkspaceSuspense(<DocumentationPage />) },
                          { path: 'organization/review', element: withWorkspaceSuspense(<ReviewSubmissionPage />) },
                        ],
                      },
                      { path: 'organization/pending', element: withWorkspaceSuspense(<VerificationPendingPage />) },
                      { path: 'organization/rejected', element: withWorkspaceSuspense(<VerificationRejectedPage />) },
                      { path: 'organization/verified', element: withWorkspaceSuspense(<OrganizationVerifiedPage />) },
                      { path: 'organization/overview', element: withWorkspaceSuspense(<OrganizationOverviewPage />) },
                    ],
                  },
                ],
              },
              { path: 'profile', element: withWorkspaceSuspense(<ProfilePage />) },
              {
                path: 'projects',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'identity',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'compliance',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'corporate-actions',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'documents',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'reports',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'team',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
              {
                path: 'settings',
                element: <Navigate to={ROUTES.dashboard} replace />,
              },
            ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: ROUTES.unauthorized, element: withSuspense(<UnauthorizedPage />) },
  { path: ROUTES.forbidden, element: withSuspense(<ForbiddenPage />) },
  { path: ROUTES.networkError, element: withSuspense(<NetworkErrorPage />) },
  { path: '*', element: withSuspense(<NotFoundPage />) },
]);
