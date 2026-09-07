import { Outlet } from 'react-router-dom';
import { Breadcrumbs } from './components/Breadcrumbs';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';

export function MainLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);

  return (
    <div className={cn('app-shell', collapsed && 'app-shell--sidebar-collapsed')}>
      <Sidebar />
      <div className="app-shell__main">
        <Header />
        <main className="page-container">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
