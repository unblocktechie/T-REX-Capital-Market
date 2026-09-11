import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { TrexLoader } from '@/components/loaders/TrexLoader';
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
import { WorkspaceMiddleware } from '@/middleware/WorkspaceMiddleware';
import { useAuth } from '@/hooks/useAuth';
import { useInvestorAccessStatus } from '@/hooks/useInvestorAccessStatus';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const InvestorsRoutePage = lazy(() => import('@/pages/investors/InvestorsRoutePage'));
const IssuerInvestorSubscriptionReviewPage = lazy(() => import('@/pages/issuer/IssuerInvestorSubscriptionReviewPage'));
const IssuerInvestorDirectoryPage = lazy(() => import('@/pages/issuer/IssuerInvestorDirectoryPage'));
const IssuerRedemptionsPage = lazy(() => import('@/pages/issuer/IssuerRedemptionsPage'));
const IssuerRedemptionDetailPage = lazy(() => import('@/pages/issuer/IssuerRedemptionDetailPage'));
const MarketplacePage = lazy(() => import('@/pages/investor-portal/MarketplacePage'));
const InvitationsPage = lazy(() => import('@/pages/investor-portal/InvitationsPage'));
const MarketplaceTokenDetailsPage = lazy(() => import('@/pages/investor-portal/MarketplaceTokenDetailsPage'));
const MyApplicationsPage = lazy(() => import('@/pages/investor-portal/MyApplicationsPage'));
const PortfolioPage = lazy(() => import('@/pages/investor-portal/PortfolioPage'));
const AssetManagementPage = lazy(() => import('@/pages/investor-portal/AssetManagementPage'));
const ApplicationDetailsPage = lazy(() => import('@/pages/investor-portal/ApplicationDetailsPage'));
const PurchaseTokenPage = lazy(() => import('@/pages/investor-portal/PurchaseTokenPage'));
const SendTokenPage = lazy(() => import('@/pages/investor-portal/SendTokenPage'));
const RedeemTokenPage = lazy(() => import('@/pages/investor-portal/RedeemTokenPage'));
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
const OrganizationReviewPage = lazy(() => import('@/pages/admin/OrganizationReviewPage'));
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage'));

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  const investorAccess = useInvestorAccessStatus(
    user?.role === ROLES.investor ? user : null,
  );
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />;
  if (user?.role === ROLES.admin) return <Navigate to={ROUTES.adminReviewQueue} replace />;
  if (user?.role === ROLES.investor && !investorAccess.isWorkspaceUnlocked) {
    return <Navigate to={ROUTES.investors} replace />;
  }
  return <Navigate to={ROUTES.dashboard} replace />;
}

const withSuspense = (element) => (
  <Suspense
    fallback={
      <TrexLoader
        variant="route"
        compact
        eyebrow="Loading module"
        title="Opening your workspace"
        message="Preparing the next secure T-REX module…"
      />
    }
  >
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
              { path: 'dashboard', element: withSuspense(<AdminDashboardPage />) },
              { path: 'reviews', element: withSuspense(<ReviewQueuePage />) },
              { path: 'organizations', element: withSuspense(<AdminOrganizationsPage />) },
              { path: 'organizations/:organizationId', element: withSuspense(<OrganizationReviewPage />) },
              { path: 'profile', element: withSuspense(<AdminProfilePage />) },
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
            element: <MainLayout />,
            children: [
          {
            element: <OrganizationAccessMiddleware />,
            children: [
              { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
              { path: 'dashboard', element: withSuspense(<DashboardPage />) },
              { path: 'investors', element: withSuspense(<InvestorsRoutePage />) },
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
                      { path: 'tokens/new', element: withSuspense(<TokenIssuanceOverviewPage />) },
                      { path: 'tokens/new/token-information', element: withSuspense(<TokenInformationPage />) },
                      { path: 'tokens/new/supply-pricing', element: <Navigate to={ROUTES.tokenIssuanceStep('token-information')} replace /> },
                      { path: 'tokens/new/identity-claims', element: withSuspense(<IdentityClaimsPage />) },
                      { path: 'tokens/new/compliance', element: withSuspense(<ComplianceRulesPage />) },
                      { path: 'tokens/new/agents', element: withSuspense(<AgentsPage />) },
                      { path: 'tokens/new/review', element: withSuspense(<ReviewDeployPage />) },
                      { path: 'tokens/new/deploying', element: withSuspense(<DeploymentProcessingPage />) },
                    ],
                  },
                  { path: 'tokens/:tokenAddress/success', element: withSuspense(<DeploymentSuccessPage />) },
                  { path: 'tokens/:tokenAddress', element: withSuspense(<TokenDetailsPage />) },
                  { path: 'investors/:requestId', element: withSuspense(<IssuerInvestorSubscriptionReviewPage />) },
                  { path: 'investor-directory', element: withSuspense(<IssuerInvestorDirectoryPage />) },
                  { path: 'redemptions', element: withSuspense(<IssuerRedemptionsPage />) },
                  { path: 'redemptions/:redemptionUid', element: withSuspense(<IssuerRedemptionDetailPage />) },
                ],
              },
              {
                element: <RoleMiddleware roles={[ROLES.investor]} />,
                children: [
                  { path: 'marketplace', element: withSuspense(<MarketplacePage />) },
                  { path: 'marketplace/:tokenId', element: withSuspense(<MarketplaceTokenDetailsPage />) },
                  { path: 'invitations', element: withSuspense(<InvitationsPage />) },
                  { path: 'applications', element: withSuspense(<MyApplicationsPage />) },
                  { path: 'portfolio', element: withSuspense(<PortfolioPage />) },
                  { path: 'asset-management', element: withSuspense(<AssetManagementPage />) },
                  { path: 'applications/:interestUid', element: withSuspense(<ApplicationDetailsPage />) },
                  { path: 'applications/:interestUid/submit-claim', element: withSuspense(<SubmitClaimPage />) },
                  { path: 'applications/:interestUid/purchase', element: withSuspense(<PurchaseTokenPage />) },
                  { path: 'applications/:interestUid/send', element: withSuspense(<SendTokenPage />) },
                  { path: 'applications/:interestUid/redeem', element: withSuspense(<RedeemTokenPage />) },
                ],
              },
              {
                element: <RoleMiddleware roles={[ROLES.issuer]} />,
                children: [
                  {
                    element: <OrganizationDataGuard />,
                    children: [
                      { path: 'organization', element: withSuspense(<OrganizationEntryPage />) },
                      {
                        element: <OrganizationEditableGuard />,
                        children: [
                          { path: 'organization/company-information', element: withSuspense(<CompanyInformationPage />) },
                          { path: 'organization/jurisdiction', element: withSuspense(<JurisdictionPage />) },
                          { path: 'organization/ubo', element: withSuspense(<BeneficialOwnersPage />) },
                          { path: 'organization/documents', element: withSuspense(<DocumentationPage />) },
                          { path: 'organization/review', element: withSuspense(<ReviewSubmissionPage />) },
                        ],
                      },
                      { path: 'organization/pending', element: withSuspense(<VerificationPendingPage />) },
                      { path: 'organization/rejected', element: withSuspense(<VerificationRejectedPage />) },
                      { path: 'organization/verified', element: withSuspense(<OrganizationVerifiedPage />) },
                      { path: 'organization/overview', element: withSuspense(<OrganizationOverviewPage />) },
                    ],
                  },
                ],
              },
              { path: 'profile', element: withSuspense(<ProfilePage />) },
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
                path: 'transactions',
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
