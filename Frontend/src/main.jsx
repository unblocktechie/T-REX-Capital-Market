import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { setupAxiosInterceptors } from '@/api/axios';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { queryClient } from '@/lib/queryClient';
import '@/assets/styles/global.css';

setupAxiosInterceptors();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
