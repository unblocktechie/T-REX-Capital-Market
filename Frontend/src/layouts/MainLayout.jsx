import { Outlet, useLocation } from 'react-router-dom';
import { Breadcrumbs } from './components/Breadcrumbs';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useAppNetwork } from '@/hooks/useAppNetwork';
import { useInvestorAccessStatus } from '@/hooks/useInvestorAccessStatus';
import { useOrganization } from '@/hooks/useOrganization';
import { isOrganizationWorkspaceUnlocked } from '@/services/organizationStorageService';
import { networkUserKey, useNetworkStore } from '@/store/network.store';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';

export function MainLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const { user } = useAuth();
  const userKey = networkUserKey(user);
  const selectedChainUid = useNetworkStore((state) => state.activeChainUidByUser[userKey] || '');
  const { organization } = useOrganization();
  const investorAccess = useInvestorAccessStatus(
    user?.role === ROLES.investor ? user : null,
  );
  const location = useLocation();
  const appNetwork = useAppNetwork({ pathname: location.pathname });

  const isIssuer = user?.role === ROLES.issuer;
  const isInvestor = user?.role === ROLES.investor;
  const isVerifiedSuccessPage = location.pathname === ROUTES.organizationVerified;
  const isInvestorOnboardingPage = location.pathname === ROUTES.investors;
  const issuerOnboardingOnly =
    isIssuer &&
    (!isOrganizationWorkspaceUnlocked(organization) || isVerifiedSuccessPage);
  const investorOnboardingOnly =
    isInvestor &&
    (!investorAccess.isWorkspaceUnlocked || isInvestorOnboardingPage);
  const onboardingOnly = issuerOnboardingOnly || investorOnboardingOnly;
  // Issuer and investor workspaces use a mix of React Query and imperative loaders.
  // Remount the active route when chainUid changes so chain-scoped detail state,
  // pagination, and pending local actions cannot leak across networks.
  // Wallet management is intentionally multi-network. Circle Bridge Kit changes
  // the connected wallet chain while a bridge is running (source -> destination).
  // Those signer-chain changes must not remount the route, otherwise page-local
  // bridge state disappears while MetaMask still has confirmations in progress.
  // Other workspace routes keep the chain-keyed remount behavior that prevents
  // chain-scoped state from leaking between application networks.
  const preserveWalletManagementRoute = location.pathname === ROUTES.walletManagement;
  const outletKey = preserveWalletManagementRoute
    ? 'wallet-management'
    : (isIssuer || isInvestor) && !onboardingOnly
      ? `${isIssuer ? 'issuer' : 'investor'}-chain:${selectedChainUid || 'unselected'}`
      : 'workspace';

  return (
    <div
      className={cn(
        'app-shell app-form-scope',
        collapsed && !onboardingOnly && 'app-shell--sidebar-collapsed',
        onboardingOnly && 'app-shell--onboarding',
      )}
    >
      {!onboardingOnly ? <Sidebar network={appNetwork} /> : null}
      <div className="app-shell__main">
        <Header onboardingOnly={onboardingOnly} network={appNetwork} />
        <main className="page-container">
          {!onboardingOnly ? <Breadcrumbs /> : null}
          <Outlet key={outletKey} />
        </main>
      </div>
    </div>
  );
}
