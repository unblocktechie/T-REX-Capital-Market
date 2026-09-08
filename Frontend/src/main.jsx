import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import App from './App';
import { setupAxiosInterceptors } from '@/api/axios';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { queryClient } from '@/lib/queryClient';
import { wagmiConfig } from '@/config/web3';
import '@/assets/styles/global.css';
import '@/assets/styles/organization.css';
import '@/assets/styles/token-issuance.css';

setupAxiosInterceptors();

ReactDOM.createRoot(document.getElementById('root')).render(
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
