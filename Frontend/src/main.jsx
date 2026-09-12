import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { setupAxiosInterceptors } from '@/api/axios';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { queryClient } from '@/lib/queryClient';
import { env } from '@/config/env';
import { requiredChain, supportedChains } from '@/config/web3';
import '@/assets/styles/global.css';
import '@/assets/styles/organization.css';
import '@/assets/styles/token-issuance.css';
import '@/assets/styles/investor.css';
import '@/assets/styles/typography.css';

setupAxiosInterceptors();

const privyConfig = {
  loginMethods: ['email'],
  defaultChain: requiredChain,
  supportedChains,
  // Whitelabel email login does not run automatic wallet creation, so the auth
  // flow explicitly calls useCreateWallet after a successful Privy OTP.
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'off',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <PrivyProvider
      appId={env.privy.appId}
      {...(env.privy.clientId ? { clientId: env.privy.clientId } : {})}
      config={privyConfig}
    >
      <QueryClientProvider client={queryClient}>
        {/* Keep SDK providers outside StrictMode so development-only double mounts do not
            duplicate Privy session/wallet initialization requests. Application components
            still receive StrictMode checks. */}
        <React.StrictMode>
          <App />
        </React.StrictMode>
      </QueryClientProvider>
    </PrivyProvider>
  </ErrorBoundary>,
);
