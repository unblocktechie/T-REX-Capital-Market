import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthBootstrap } from '@/components/auth/AuthBootstrap';
import { GlobalLoader } from '@/components/loaders/GlobalLoader';
import { InvestorClaimRecoveryBootstrap } from '@/components/investor/InvestorClaimRecoveryBootstrap';
import { router } from '@/routes/router';

export default function App() {
  return (
    <>
      <GlobalLoader />
      <AuthBootstrap>
        <InvestorClaimRecoveryBootstrap />
        <RouterProvider router={router} />
      </AuthBootstrap>
      <Toaster theme="light" richColors position="top-right" closeButton />
    </>
  );
}
