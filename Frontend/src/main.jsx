import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { createWagmiConfig, loadWeb3Bootstrap } from '@/config/web3';
import { WorkspaceRouteLoader } from '@/components/loaders/DelayedTrexLoader';
import '@/assets/styles/global.css';
import '@/assets/styles/organization.css';
import '@/assets/styles/token-issuance.css';
import '@/assets/styles/investor.css';
import '@/assets/styles/typography.css';
import '@/assets/styles/form-system.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the minimal T-REX overlay before awaiting network bootstrap.
// This avoids a blank React root while the app and routes initialize.
root.render(<WorkspaceRouteLoader />);

function BootstrapError({ message }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-slate-950">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-rose-50 text-2xl" aria-hidden="true">!</div>
        <h1 className="mb-2 text-2xl font-semibold">Network configuration unavailable</h1>
        <p className="mb-6 text-sm leading-6 text-slate-600">
          The application could not load the supported blockchain networks from the platform. No wallet or transaction action has been started.
        </p>
        <p className="mb-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{message}</p>
        <button type="button" className="button button--primary button--full" onClick={() => window.location.reload()}>
          Retry
        </button>
      </section>
    </main>
  );
}

async function start() {
  try {
    await loadWeb3Bootstrap();
    const wagmiConfig = createWagmiConfig();
    const [
      { default: App },
      { router },
      { authRedirectService },
      { setupAxiosInterceptors },
      { ErrorBoundary },
      { queryClient },
    ] = await Promise.all([
      import('./App'),
      import('@/routes/router'),
      import('@/services/auth-redirect.service'),
      import('@/api/axios'),
      import('@/components/common/ErrorBoundary'),
      import('@/lib/queryClient'),
    ]);

    authRedirectService.setNavigator((to, options) => router.navigate(to, options));
    setupAxiosInterceptors();

    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </WagmiProvider>
        </ErrorBoundary>
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('Application bootstrap failed', error);
    root.render(<BootstrapError message="Please refresh and try again. If the problem continues, contact support." />);
  }
}

start();
