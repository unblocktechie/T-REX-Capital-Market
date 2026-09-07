import { useEffect } from 'react';
import { Building2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { TrexLogo } from '@/components/branding/TrexLogo';
import { navigationGroups } from '@/config/navigation';
import { ROLES } from '@/config/permissions';
import { OrganizationStatusBadge } from '@/components/organization/OrganizationStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/store/ui.store';
import { useOrganization } from '@/hooks/useOrganization';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';
import { cn } from '@/utils/cn';

export function Sidebar() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const open = useUiStore((state) => state.sidebarOpen);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const close = useUiStore((state) => state.closeSidebar);
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const canSee = (permission) => !permission || user?.permissions?.includes(permission);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const handleEscape = (event) => event.key === 'Escape' && close();
    const handleViewportChange = (event) => {
      if (!event.matches) close();
    };

    if (open && media.matches) document.body.classList.add('navigation-open');
    document.addEventListener('keydown', handleEscape);
    media.addEventListener('change', handleViewportChange);

    return () => {
      document.body.classList.remove('navigation-open');
      document.removeEventListener('keydown', handleEscape);
      media.removeEventListener('change', handleViewportChange);
    };
  }, [open, close]);

  return (
    <>
      <aside
        className={cn('sidebar', open && 'sidebar--open', collapsed && 'sidebar--collapsed')}
        aria-label="Application sidebar"
      >
        <div className="brand">
          <TrexLogo />
          <button
            className="icon-button sidebar__close"
            onClick={close}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace-pill">
          <span className="workspace-pill__icon">
            <Building2 size={17} />
          </span>
          <span className="workspace-pill__copy">
            <small>Issuer workspace</small>
            <strong>{user?.company || 'Your organization'}</strong>
          </span>
          <span className="workspace-pill__network">Testnet</span>
        </div>

        <nav className="sidebar__nav" aria-label="Primary navigation">
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) =>
                canSee(item.permission) &&
                (!item.dynamicOrganization || user?.role === ROLES.issuer),
            );
            if (!visibleItems.length) return null;
            return (
              <div className="sidebar-group" key={group.label}>
                <p>{group.label}</p>
                {visibleItems.map((item) => {
                  const isOrganizationItem = item.dynamicOrganization;
                  const organizationLabel =
                    organization.status === ORGANIZATION_STATUSES.NOT_STARTED
                      ? 'Create Organization'
                      : organization.status === ORGANIZATION_STATUSES.DRAFT
                        ? 'Continue Organization'
                        : 'Organization';
                  const label = isOrganizationItem ? organizationLabel : item.label;
                  const showOrganizationBadge =
                    isOrganizationItem &&
                    [
                      ORGANIZATION_STATUSES.SUBMITTED,
                      ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING,
                      ORGANIZATION_STATUSES.VERIFIED,
                    ].includes(organization.status);

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={close}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) => cn('sidebar-link', isActive && 'is-active')}
                    >
                      <item.icon size={19} aria-hidden="true" />
                      <span className="sidebar-link__label">{label}</span>
                      {showOrganizationBadge ? (
                        <OrganizationStatusBadge status={organization.status} compact />
                      ) : item.badge ? (
                        <small className="sidebar-link__badge">{item.badge}</small>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <button
          className="sidebar-collapse-button"
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span>{collapsed ? 'Expand' : 'Collapse menu'}</span>
        </button>
      </aside>
      {open ? (
        <button
          className="sidebar-backdrop"
          onClick={close}
          aria-label="Close navigation overlay"
        />
      ) : null}
    </>
  );
}
