import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { ROUTES } from '@/config/routes';
import { PERMISSIONS } from '@/config/permissions';
import { AuthLayout } from '@/layouts/AuthLayout';
import { MainLayout } from '@/layouts/MainLayout';
import { AuthMiddleware } from '@/middleware/AuthMiddleware';
import { GuestMiddleware } from '@/middleware/GuestMiddleware';
import { PermissionMiddleware } from '@/middleware/PermissionMiddleware';

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
  { path: ROUTES.root, element: <Navigate to={ROUTES.dashboard} replace /> },
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
        path: '/app',
        element: <MainLayout />,
        children: [
          { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
          { path: 'dashboard', element: withSuspense(<DashboardPage />) },
          { path: 'projects', element: withSuspense(<ModulePage moduleKey="projects" />) },
          { path: 'tokens/new', element: withSuspense(<ModulePage moduleKey="createToken" />) },
          { path: 'identity', element: withSuspense(<ModulePage moduleKey="identity" />) },
          { path: 'compliance', element: withSuspense(<ModulePage moduleKey="compliance" />) },
          { path: 'investors', element: withSuspense(<ModulePage moduleKey="investors" />) },
          {
            path: 'transactions',
            element: withSuspense(<ModulePage moduleKey="transactions" />),
          },
          {
            path: 'corporate-actions',
            element: withSuspense(<ModulePage moduleKey="corporateActions" />),
          },
          { path: 'documents', element: withSuspense(<ModulePage moduleKey="documents" />) },
          { path: 'reports', element: withSuspense(<ModulePage moduleKey="reports" />) },
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
  { path: ROUTES.unauthorized, element: withSuspense(<UnauthorizedPage />) },
  { path: ROUTES.forbidden, element: withSuspense(<ForbiddenPage />) },
  { path: ROUTES.networkError, element: withSuspense(<NetworkErrorPage />) },
  { path: '*', element: withSuspense(<NotFoundPage />) },
]);
