import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, LogOut, Menu, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/api/auth';
import { TrexLogo } from '@/components/branding/TrexLogo';
import { WalletControl } from '@/components/wallet/WalletControl';
import { routeMeta } from '@/config/navigation';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/store/ui.store';

const formatRole = (role) => {
  if (!role) return 'Issuer';
  return role
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export function Header({ onboardingOnly = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileRef = useRef(null);

  const isApplicationRecordPage = location.pathname.startsWith(`${ROUTES.applications}/`);
  const isIssuerRedemptionPage = location.pathname.startsWith(`${ROUTES.issuerRedemptions}/`);
  const isTokenRecordPage =
    location.pathname.startsWith('/app/tokens/') &&
    !location.pathname.startsWith(ROUTES.createToken);
  const roleAwareMeta =
    user?.role === ROLES.investor && location.pathname === ROUTES.dashboard
      ? { title: 'Investor Dashboard', description: 'Your investments, invitations and token activity' }
      : user?.role === ROLES.investor && location.pathname === ROUTES.profile
        ? { title: 'Investor Profile', description: 'Your submitted identity and verification details' }
        : user?.role === ROLES.investor && location.pathname === ROUTES.investors
          ? { title: 'Investor Onboarding', description: 'Set up your investor profile and eligibility' }
          : null;
  const currentMeta =
    roleAwareMeta ||
    routeMeta[location.pathname] ||
    (location.pathname.startsWith(ROUTES.organization) ? routeMeta[ROUTES.organization] : null) ||
    (isApplicationRecordPage ? routeMeta[ROUTES.applications] : null) ||
    (isIssuerRedemptionPage ? routeMeta[ROUTES.issuerRedemptions] : null) ||
    (isTokenRecordPage ? routeMeta.tokenDetails : null) ||
    routeMeta[ROUTES.dashboard];

  useEffect(() => {
    const closeProfileMenu = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };

    document.addEventListener('pointerdown', closeProfileMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeProfileMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  const handleNavigationToggle = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      toggleSidebar();
      return;
    }
    toggleSidebarCollapsed();
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await authService.logout();
      navigate(ROUTES.login, { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const initials = (user?.name || 'User')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const roleLabel = formatRole(user?.role);

  const accountMenu = (
    <div className="account-menu" ref={profileRef}>
      <button
        type="button"
        className="account-menu__trigger"
        onClick={() => setProfileOpen((value) => !value)}
        aria-label={onboardingOnly ? 'Open logout menu' : `Open ${roleLabel} profile menu`}
        title={`${user?.name || 'User'} · ${roleLabel}`}
        aria-haspopup="menu"
        aria-expanded={profileOpen}
      >
        <span className="avatar account-menu__avatar">{initials || 'U'}</span>
        <span className="account-menu__summary">
          <strong>{user?.name || 'Issuer User'}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown
          className={`account-menu__chevron${profileOpen ? ' is-open' : ''}`}
          size={17}
          aria-hidden="true"
        />
      </button>

      {profileOpen ? (
        <div
          className="account-menu__panel"
          role="menu"
          aria-label={onboardingOnly ? 'Logout menu' : 'Profile menu'}
        >
          {!onboardingOnly ? (
            <>
              <div className="account-menu__identity">
                <span className="avatar account-menu__panel-avatar">{initials || 'U'}</span>
                <span>
                  <strong>{user?.name || 'Issuer User'}</strong>
                  <small>{user?.email || roleLabel}</small>
                </span>
              </div>
              <Link
                className="account-menu__item"
                to={user?.role === ROLES.issuer ? ROUTES.organization : ROUTES.profile}
                role="menuitem"
              >
                {user?.role === ROLES.issuer ? (
                  <Building2 size={18} aria-hidden="true" />
                ) : (
                  <UserRound size={18} aria-hidden="true" />
                )}
                <span>{user?.role === ROLES.issuer ? 'My Organization' : 'Profile'}</span>
              </Link>
            </>
          ) : null}
          <button
            type="button"
            className="account-menu__item account-menu__item--logout"
            onClick={handleLogout}
            disabled={isLoggingOut}
            role="menuitem"
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{isLoggingOut ? 'Logging out…' : 'Logout'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  if (onboardingOnly) {
    return (
      <header className="app-header app-header--onboarding">
        <div className="onboarding-header__brand" aria-label="T-REX Capital Market">
          <TrexLogo />
        </div>
        <div className="onboarding-header__account">
          <div className="header-wallet-control">
            <WalletControl onboarding />
          </div>
          {accountMenu}
        </div>
      </header>
    );
  }

  return (
    <header className="app-header">
      <div className="app-header__leading">
        <button
          className="icon-button menu-button"
          onClick={handleNavigationToggle}
          aria-label="Toggle navigation"
        >
          <Menu size={22} />
        </button>
        <div className="header-page-title">
          <strong>{currentMeta.title}</strong>
          <small>{currentMeta.description}</small>
        </div>
      </div>

      <div className="app-header__actions">
        <div className="header-wallet-control">
          <WalletControl />
        </div>
        {accountMenu}
      </div>
    </header>
  );
}
