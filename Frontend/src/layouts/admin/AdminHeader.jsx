import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/api/auth';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';
import { adminRouteMeta } from './admin.navigation';

const getMeta = (pathname) => {
  if (pathname.startsWith('/admin/organizations/') && pathname !== ROUTES.adminOrganizations) {
    return { title: 'Organization Review', description: 'Review company details, ownership, secure account information, documents, and risk.' };
  }
  return adminRouteMeta[pathname] || adminRouteMeta[ROUTES.adminDashboard];
};

export function AdminHeader() {
  const { user } = useAuth();
  const { authenticated: privyAuthenticated, logout: privyLogout } = usePrivy();
  const location = useLocation();
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileRef = useRef(null);
  const meta = useMemo(() => getMeta(location.pathname), [location.pathname]);
  const initials = (user?.name || 'Admin User')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    window.localStorage.removeItem('trex-admin-theme');
  }, []);

  useEffect(() => {
    const closeMenu = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };

    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await authService.logout();
      if (privyAuthenticated) await privyLogout();
      navigate(ROUTES.login, { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl transition-[margin] dark:border-slate-800 dark:bg-slate-950/92',
        collapsed ? 'lg:ml-[88px]' : 'lg:ml-[278px]',
      )}
    >
      <div className="mx-auto flex min-h-[76px] max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={toggleSidebar}
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          aria-label="Open admin navigation"
        >
          <Menu className="size-5" />
        </button>

        <div className="hidden min-w-0 flex-1 sm:block">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Link to={ROUTES.adminDashboard} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              Admin
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-slate-600 dark:text-slate-300">{meta.title}</span>
          </div>
          <h1 className="mt-1 mb-0 truncate text-xl font-semibold tracking-normal text-slate-950 sm:text-[22px] dark:text-white">
            {meta.title}
          </h1>
        </div>

        <div className="relative ml-auto shrink-0" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 shadow-sm transition hover:bg-slate-50 sm:px-3.5 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label="Open admin profile menu"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
              {initials}
            </span>
            <span className="hidden min-w-0 text-left sm:block">
              <strong className="block max-w-40 truncate text-sm font-semibold text-slate-950 dark:text-white">
                {user?.name || 'Admin User'}
              </strong>
              <small className="mt-0.5 block text-xs font-medium text-slate-500">Compliance Admin</small>
            </span>
            <ChevronDown
              className={cn('hidden size-4 text-slate-400 transition-transform sm:block', profileOpen && 'rotate-180')}
            />
          </button>

          {profileOpen ? (
            <div
              className="absolute top-[calc(100%+10px)] right-0 z-50 w-[min(260px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              role="menu"
            >
              <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                <strong className="block truncate text-base font-semibold text-slate-950 dark:text-white">
                  {user?.name || 'Admin User'}
                </strong>
                <small className="mt-1 block truncate text-sm text-slate-500">{user?.email}</small>
              </div>
              <Link
                to={ROUTES.adminProfile}
                className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                role="menuitem"
              >
                <UserRound className="size-[18px]" />
                Profile
              </Link>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                role="menuitem"
              >
                <LogOut className="size-[18px]" />
                {loggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
