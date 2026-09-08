import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { TrexLogo } from '@/components/branding/TrexLogo';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';
import { adminNavigation } from './admin.navigation';

function NavigationItem({ item, collapsed, onClick }) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'admin-sidebar__link group flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-all',
        isActive && 'is-active',
        collapsed && 'justify-center px-0',
      )}
    >
      <item.icon className="size-5 shrink-0" aria-hidden="true" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && item.badge ? <span className="admin-sidebar__badge">Live</span> : null}
    </NavLink>
  );
}

export function AdminSidebar() {
  const open = useUiStore((state) => state.sidebarOpen);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const close = useUiStore((state) => state.closeSidebar);
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const onKeyDown = (event) => event.key === 'Escape' && close();
    const onViewportChange = (event) => {
      if (!event.matches) close();
    };

    if (open && media.matches) document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    media.addEventListener('change', onViewportChange);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
      media.removeEventListener('change', onViewportChange);
    };
  }, [open, close]);

  return (
    <>
      <aside
        className={cn(
          'admin-sidebar fixed top-[76px] bottom-0 left-0 z-40 flex w-[278px] -translate-x-full flex-col px-3 py-4 transition-[width,transform] duration-300 lg:inset-y-0 lg:z-50 lg:translate-x-0',
          open && 'translate-x-0',
          collapsed && 'lg:w-[88px]',
        )}
        aria-label="Admin navigation"
      >
        <div className={cn('admin-sidebar__brand flex h-12 items-center gap-3 px-2', collapsed && 'lg:justify-center lg:px-0')}>
          <TrexLogo compact={collapsed} className="admin-trex-logo shrink-0" />
          <button
            type="button"
            onClick={close}
            className="admin-sidebar__close ml-auto grid size-10 place-items-center rounded-xl transition lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        {!collapsed ? (
          <div className="admin-sidebar__workspace mx-1 mt-5 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="admin-sidebar__workspace-icon grid size-10 shrink-0 place-items-center rounded-xl">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="admin-sidebar__eyebrow m-0 text-[11px] font-semibold tracking-[0.12em] uppercase">
                  Protected workspace
                </p>
                <strong className="admin-sidebar__workspace-title mt-1 block truncate text-[15px] font-semibold">
                  Compliance Admin
                </strong>
              </div>
            </div>
            <p className="admin-sidebar__workspace-copy mt-3 mb-0 text-sm leading-5">
              ERC-3643 organization approval and review controls.
            </p>
          </div>
        ) : null}

        <nav className="admin-sidebar__nav mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto px-1" aria-label="Primary admin navigation">
          {!collapsed ? (
            <p className="admin-sidebar__section mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] uppercase">
              Workspace
            </p>
          ) : null}
          <div className="space-y-1.5">
            {adminNavigation.map((item) => (
              <NavigationItem key={item.to} item={item} collapsed={collapsed} onClick={close} />
            ))}
          </div>
        </nav>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="admin-sidebar__collapse mt-3 hidden min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          {!collapsed ? 'Collapse menu' : null}
        </button>
      </aside>

      {open ? (
        <button
          type="button"
          onClick={close}
          className="admin-sidebar__backdrop fixed top-[76px] right-0 bottom-0 left-0 z-30 lg:hidden"
          aria-label="Close navigation overlay"
        />
      ) : null}
    </>
  );
}
