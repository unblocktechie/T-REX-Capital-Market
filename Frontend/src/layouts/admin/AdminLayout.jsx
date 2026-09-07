import { Outlet } from 'react-router-dom';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';

export function AdminLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white">
      <AdminSidebar />
      <AdminHeader />
      <main className={cn('transition-[margin] duration-300', collapsed ? 'lg:ml-[88px]' : 'lg:ml-[278px]')}>
        <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
