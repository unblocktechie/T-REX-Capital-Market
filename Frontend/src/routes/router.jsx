import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import {
  OrganizationDataGuard,
  OrganizationEditableGuard,
} from '@/components/organization/OrganizationRouteGuards';
import { ROUTES } from '@/config/routes';
import { PERMISSIONS, ROLES } from '@/config/permissions';
import { AuthLayout } from '@/layouts/AuthLayout';
import { MainLayout } from '@/layouts/MainLayout';
import { AdminLayout } from '@/layouts/admin/AdminLayout';
import { AuthMiddleware } from '@/middleware/AuthMiddleware';
import { GuestMiddleware } from '@/middleware/GuestMiddleware';
import { PermissionMiddleware } from '@/middleware/PermissionMiddleware';
import { OrganizationAccessMiddleware } from '@/middleware/OrganizationAccessMiddleware';
import { RoleMiddleware } from '@/middleware/RoleMiddleware';
import { WorkspaceMiddleware } from '@/middleware/WorkspaceMiddleware';
import { useAuth } from '@/hooks/useAuth';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ModulePage = lazy(() => import('@/pages/common/ModulePage'));
const UsersPage = lazy(() => import('@/pages/users/UsersPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'));
const ForbiddenPage = lazy(() => import('@/pages/errors/ForbiddenPage'));
const UnauthorizedPage = lazy(() => import('@/pages/errors/UnauthorizedPage'));
const NetworkErrorPage = lazy(() => import('@/pages/errors/NetworkErrorPage'));
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
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminAuditLogsPage = lazy(() => import('@/pages/admin/AdminAuditLogsPage'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage'));
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage'));
const AdminDocumentationPage = lazy(() => import('@/pages/admin/AdminDocumentationPage'));
const AdminSecurityLogsPage = lazy(() => import('@/pages/admin/AdminSecurityLogsPage'));

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />;
  return <Navigate to={user?.role === ROLES.admin ? ROUTES.adminReviewQueue : ROUTES.dashboard} replace />;
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
              { path: 'users', element: withSuspense(<AdminUsersPage />) },
              { path: 'audit-logs', element: withSuspense(<AdminAuditLogsPage />) },
              { path: 'settings', element: withSuspense(<AdminSettingsPage />) },
              { path: 'profile', element: withSuspense(<AdminProfilePage />) },
              { path: 'documentation', element: withSuspense(<AdminDocumentationPage />) },
              { path: 'security-logs', element: withSuspense(<AdminSecurityLogsPage />) },
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
              { path: 'projects', element: withSuspense(<ModulePage moduleKey="projects" />) },
              { path: 'tokens/new', element: withSuspense(<ModulePage moduleKey="createToken" />) },
              { path: 'identity', element: withSuspense(<ModulePage moduleKey="identity" />) },
              { path: 'compliance', element: withSuspense(<ModulePage moduleKey="compliance" />) },
              { path: 'investors', element: withSuspense(<ModulePage moduleKey="investors" />) },
              { path: 'transactions', element: withSuspense(<ModulePage moduleKey="transactions" />) },
              { path: 'corporate-actions', element: withSuspense(<ModulePage moduleKey="corporateActions" />) },
              { path: 'documents', element: withSuspense(<ModulePage moduleKey="documents" />) },
              { path: 'reports', element: withSuspense(<ModulePage moduleKey="reports" />) },
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
              {
                element: <PermissionMiddleware permissions={[PERMISSIONS.usersView]} />,
                children: [{ path: 'team', element: withSuspense(<UsersPage />) }],
              },
              { path: 'profile', element: withSuspense(<ProfilePage />) },
              {
                element: <PermissionMiddleware permissions={[PERMISSIONS.settingsView]} />,
                children: [{ path: 'settings', element: withSuspense(<SettingsPage />) }],
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
