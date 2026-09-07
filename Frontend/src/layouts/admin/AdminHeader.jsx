import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, Command, LogOut, Menu, Search, Settings, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/api/auth';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';
import { adminRouteMeta } from './admin.navigation';

const getMeta = (pathname) => {
  if (pathname.startsWith('/admin/organizations/') && pathname !== ROUTES.adminOrganizations) {
    return { title: 'Organization Review', description: 'Review entity, ownership, wallet, documents, and risk.' };
  }
  return adminRouteMeta[pathname] || adminRouteMeta[ROUTES.adminDashboard];
};

export function AdminHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const profileRef = useRef(null);
  const notificationRef = useRef(null);
  const meta = useMemo(() => getMeta(location.pathname), [location.pathname]);
  const initials = (user?.name || 'Admin User').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    window.localStorage.removeItem('trex-admin-theme');
  }, []);

  useEffect(() => {
    const closeMenus = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(event.target)) setNotificationsOpen(false);
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, []);

  const logout = async () => {
    await authService.logout();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <header className={cn('sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl transition-[margin] dark:border-slate-800 dark:bg-slate-950/88', collapsed ? 'lg:ml-[88px]' : 'lg:ml-[278px]')}>
      <div className="mx-auto flex min-h-[76px] max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={toggleSidebar} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" aria-label="Open admin navigation">
          <Menu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
            <Link to={ROUTES.adminDashboard} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">Admin</Link>
            <span>/</span>
            <span className="truncate text-slate-600 dark:text-slate-300">{meta.title}</span>
          </div>
          <h1 className="mt-1 mb-0 truncate text-lg font-semibold tracking-normal text-slate-950 sm:text-xl dark:text-white">{meta.title}</h1>
        </div>

        <label className="hidden min-w-[220px] max-w-[420px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10 xl:flex dark:border-slate-800 dark:bg-slate-900 dark:focus-within:border-blue-500/50 dark:focus-within:bg-slate-900">
          <Search className="size-4 shrink-0" />
          <input className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white" type="search" placeholder="Search organizations, wallets, reviewers…" aria-label="Search admin workspace" />
          <kbd className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800"><Command className="size-3" />K</kbd>
        </label>

        <button type="button" className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 xl:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" aria-label="Search">
          <Search className="size-[18px]" />
        </button>
        <div className="relative" ref={notificationRef}>
          <button type="button" onClick={() => setNotificationsOpen((value) => !value)} className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Notifications" aria-expanded={notificationsOpen}>
            <Bell className="size-[18px]" />
            <span className="absolute top-2 right-2 size-2 rounded-full border-2 border-white bg-rose-500 dark:border-slate-900" />
          </button>
          {notificationsOpen ? (
            <div className="absolute top-12 right-0 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><strong className="text-sm text-slate-950 dark:text-white">Notifications</strong></div>
              <div className="space-y-1 p-2">
                {[
                  ['3 organizations need review', 'Review queue · just now'],
                  ['High-risk screening result', 'Dune Growth Partners · 12 min ago'],
                  ['Document verification completed', 'Nova Verde · 42 min ago'],
                ].map(([title, metaText]) => (
                  <button key={title} type="button" className="w-full rounded-xl p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800">
                    <strong className="block text-sm font-semibold text-slate-900 dark:text-white">{title}</strong>
                    <small className="mt-1 block text-xs text-slate-500">{metaText}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative" ref={profileRef}>
          <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 shadow-sm transition hover:bg-slate-50 sm:px-3 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800" aria-expanded={profileOpen} aria-label="Open admin profile menu">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">{initials}</span>
            <span className="hidden min-w-0 text-left sm:block">
              <strong className="block max-w-28 truncate text-xs text-slate-950 dark:text-white">{user?.name || 'Admin User'}</strong>
              <small className="block text-[10px] font-semibold text-slate-500">Compliance Admin</small>
            </span>
            <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
          </button>
          {profileOpen ? (
            <div className="absolute top-13 right-0 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                <strong className="block truncate text-sm text-slate-950 dark:text-white">{user?.name || 'Admin User'}</strong>
                <small className="block truncate text-xs text-slate-500">{user?.email}</small>
              </div>
              <Link to={ROUTES.adminProfile} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"><UserRound className="size-4" />Profile</Link>
              <Link to={ROUTES.adminSettings} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"><Settings className="size-4" />Settings</Link>
              <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"><LogOut className="size-4" />Logout</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
