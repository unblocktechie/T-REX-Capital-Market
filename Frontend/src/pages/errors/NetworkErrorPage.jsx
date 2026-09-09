import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { STORAGE_KEYS } from '@/constants';

const isSafeInternalPath = (value) =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  value !== ROUTES.networkError;

export default function NetworkErrorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRetrying, setIsRetrying] = useState(false);

  const returnPath = useMemo(() => {
    const routeStatePath = location.state?.from;
    if (isSafeInternalPath(routeStatePath)) return routeStatePath;

    const storedPath = window.sessionStorage.getItem(STORAGE_KEYS.networkErrorReturnPath);
    if (isSafeInternalPath(storedPath)) return storedPath;

    return ROUTES.dashboard;
  }, [location.state]);

  useEffect(() => {
    if (isSafeInternalPath(location.state?.from)) {
      window.sessionStorage.setItem(
        STORAGE_KEYS.networkErrorReturnPath,
        location.state.from,
      );
    }
  }, [location.state]);

  const handleRetry = () => {
    setIsRetrying(true);

    // Remove failed query snapshots so the original route performs a clean
    // backend request instead of immediately rendering the cached error again.
    queryClient.removeQueries({
      predicate: (query) => Boolean(query.state.error),
    });

    window.sessionStorage.removeItem(STORAGE_KEYS.networkErrorReturnPath);
    navigate(returnPath, { replace: true });
  };

  return (
    <main className="error-page network-error-page">
      <div className="network-error-page__visual" aria-hidden="true">
        <div className="error-code network-error-page__code">OFFLINE</div>
        <span className="error-icon network-error-page__icon">
          <WifiOff size={28} />
        </span>
      </div>

      <div className="network-error-page__content">
        <h1>Connection interrupted.</h1>
        <p>Check your internet connection, then try loading the application again.</p>
        <Button onClick={handleRetry} loading={isRetrying}>
          Try again
        </Button>
      </div>
    </main>
  );
}
