import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Plus,
  Search,
  WalletCards,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { routeMeta } from '@/config/navigation';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/store/ui.store';

export function Header() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const currentMeta = routeMeta[location.pathname] || routeMeta[ROUTES.dashboard];

  const handleNavigationToggle = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      toggleSidebar();
      return;
    }
    toggleSidebarCollapsed();
  };

  const handleLogout = async () => {
    await authService.logout();
    navigate(ROUTES.login, { replace: true });
  };

  const initials = user?.name
    ?.split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  return (
    <header className="app-header">
      <div className="app-header__leading">
        <button
          className="icon-button menu-button"
          onClick={handleNavigationToggle}
          aria-label="Toggle navigation"
        >
          <Menu size={21} />
        </button>
        <div className="header-page-title">
          <strong>{currentMeta.title}</strong>
          <small>{currentMeta.description}</small>
        </div>
      </div>

      <div className="header-search">
        <Search size={17} />
        <input
          type="search"
          placeholder="Search projects, investors, transactions…"
          aria-label="Search launchpad"
        />
        <kbd>⌘ K</kbd>
      </div>

      <div className="app-header__actions">
        <button
          className="mobile-search-button icon-button"
          type="button"
          aria-label="Search launchpad"
        >
          <Search size={18} />
        </button>
        <button
          className="mobile-wallet-button icon-button"
          type="button"
          aria-label="Network and wallet"
        >
          <WalletCards size={18} />
        </button>

        <button className="network-selector" type="button" aria-label="Select blockchain network">
          <span className="network-selector__dot" />
          <span className="network-selector__copy">
            <small>Network</small>
            <strong>Polygon Amoy</strong>
          </span>
          <ChevronDown size={15} />
        </button>

        <Button
          className="header-create-button"
          size="sm"
          icon={Plus}
          onClick={() => navigate(ROUTES.createToken)}
        >
          New token
        </Button>

        <button className="icon-button notification-button" aria-label="Notifications">
          <Bell size={19} />
          <span />
        </button>
        <Link to={ROUTES.profile} className="profile-chip">
          <span className="avatar">{initials}</span>
          <span>
            <strong>{user?.name}</strong>
            <small>{user?.role}</small>
          </span>
        </Link>
        <button
          className="icon-button header-logout"
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
