import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, LogOut, ShieldCheck, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { authService } from '@/api/auth';
import { TrexLogo } from '@/components/branding/TrexLogo';
import { ROUTES } from '@/config/routes';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';
import { adminNavigation, adminSecondaryNavigation } from './admin.navigation';

function NavigationItem({ item, collapsed, onClick }) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
        isActive && 'bg-slate-950 text-white shadow-sm hover:bg-slate-950 hover:text-white dark:bg-white dark:text-slate-950 dark:hover:bg-white dark:hover:text-slate-950',
        collapsed && 'justify-center px-0',
      )}
    >
      <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && item.badge ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 group-[.bg-slate-950]:bg-white/15 group-[.bg-slate-950]:text-white dark:bg-amber-500/15 dark:text-amber-300">
          Live
        </span>
      ) : null}
    </NavLink>
  );
}

export function AdminSidebar() {
  const open = useUiStore((state) => state.sidebarOpen);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const close = useUiStore((state) => state.closeSidebar);
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && close();
    if (open) document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const logout = async () => {
    await authService.logout();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[278px] -translate-x-full flex-col border-r border-slate-200 bg-white px-3 py-4 shadow-2xl transition-transform duration-300 lg:translate-x-0 lg:shadow-none dark:border-slate-800 dark:bg-slate-950',
          open && 'translate-x-0',
          collapsed && 'lg:w-[88px]',
        )}
        aria-label="Admin navigation"
      >
        <div className={cn('flex h-12 items-center gap-3 px-2', collapsed && 'lg:justify-center lg:px-0')}>
          <TrexLogo compact={collapsed} className="admin-trex-logo shrink-0" />
          <button type="button" onClick={close} className="ml-auto grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>

        {!collapsed ? (
          <div className="mx-1 mt-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-indigo-500/10">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[10px] font-semibold tracking-[0.14em] text-blue-700 uppercase dark:text-blue-300">Protected workspace</p>
                <strong className="mt-1 block truncate text-sm text-slate-950 dark:text-white">Compliance Admin</strong>
              </div>
            </div>
            <p className="mt-3 mb-0 text-xs leading-5 text-slate-600 dark:text-slate-400">ERC-3643 organization approval and audit controls.</p>
          </div>
        ) : null}

        <nav className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto px-1" aria-label="Primary admin navigation">
          {!collapsed ? <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Workspace</p> : null}
          <div className="space-y-1">
            {adminNavigation.map((item) => <NavigationItem key={item.to} item={item} collapsed={collapsed} onClick={close} />)}
          </div>
          <div className="mt-auto pt-6">
            {!collapsed ? <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Resources</p> : null}
            <div className="space-y-1">
              {adminSecondaryNavigation.map((item) => <NavigationItem key={item.to} item={item} collapsed={collapsed} onClick={close} />)}
              <button type="button" onClick={logout} className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300', collapsed && 'justify-center px-0')}>
                <LogOut className="size-[18px] shrink-0" />
                {!collapsed ? <span>Logout</span> : null}
              </button>
            </div>
          </div>
        </nav>

        <button type="button" onClick={toggleCollapsed} className="mt-3 hidden min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 transition hover:bg-slate-100 lg:flex dark:border-slate-800 dark:hover:bg-slate-800" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          {!collapsed ? 'Collapse menu' : null}
        </button>
      </aside>
      {open ? <button type="button" onClick={close} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden" aria-label="Close navigation overlay" /> : null}
    </>
  );
}
