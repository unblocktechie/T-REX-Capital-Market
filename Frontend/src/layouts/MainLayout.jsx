import { Outlet, useLocation } from 'react-router-dom';
import { Breadcrumbs } from './components/Breadcrumbs';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { isOrganizationWorkspaceUnlocked } from '@/services/organizationStorageService';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';

export function MainLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const { user } = useAuth();
  const { organization } = useOrganization();
  const location = useLocation();

  const isIssuer = user?.role === ROLES.issuer;
  const isVerifiedSuccessPage = location.pathname === ROUTES.organizationVerified;
  const onboardingOnly =
    isIssuer &&
    (!isOrganizationWorkspaceUnlocked(organization) || isVerifiedSuccessPage);

  return (
    <div
      className={cn(
        'app-shell',
        collapsed && !onboardingOnly && 'app-shell--sidebar-collapsed',
        onboardingOnly && 'app-shell--onboarding',
      )}
    >
      {!onboardingOnly ? <Sidebar /> : null}
      <div className="app-shell__main">
        <Header onboardingOnly={onboardingOnly} />
        <main className="page-container">
          {!onboardingOnly ? <Breadcrumbs /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
