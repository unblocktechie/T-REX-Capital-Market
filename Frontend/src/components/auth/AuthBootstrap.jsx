import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/constants';
import { getJwtExpirationTime, tokenService } from '@/services/token.service';
import { useAuthStore } from '@/store/auth.store';
import { queryClient } from '@/lib/queryClient';
import { TrexLoader } from '@/components/loaders/TrexLoader';

const MAX_TIMEOUT = 2_147_000_000;

export function AuthBootstrap({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let expiryTimer;

    const expireSession = () => {
      useAuthStore.getState().clearSession();
      queryClient.clear();
    };

    const scheduleExpiry = (accessToken) => {
      window.clearTimeout(expiryTimer);
      const expiresAt = getJwtExpirationTime(accessToken);
      if (!expiresAt) return;

      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        expireSession();
        return;
      }

      expiryTimer = window.setTimeout(
        () => {
          if (remaining > MAX_TIMEOUT) scheduleExpiry(accessToken);
          else expireSession();
        },
        Math.min(remaining, MAX_TIMEOUT),
      );
    };

    const restore = () => {
      const session = tokenService.getSession();
      useAuthStore.getState().restoreSession(session);
      if (session?.accessToken) scheduleExpiry(session.accessToken);
      else queryClient.clear();
    };

    const handleStorage = (event) => {
      if (event.key === null || event.key === STORAGE_KEYS.authSession) restore();
    };

    const unsubscribe = useAuthStore.subscribe((state, previousState) => {
      if (state.isAuthenticated && !previousState.isAuthenticated) {
        const session = tokenService.getSession();
        if (session?.accessToken) scheduleExpiry(session.accessToken);
      } else if (!state.isAuthenticated && previousState.isAuthenticated) {
        window.clearTimeout(expiryTimer);
      }
    });

    restore();
    setReady(true);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.clearTimeout(expiryTimer);
      window.removeEventListener('storage', handleStorage);
      unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <TrexLoader
        variant="boot"
        eyebrow="Secure workspace"
        title="Preparing T-REX Capital Market"
        message="Restoring your protected session and workspace settings…"
      />
    );
  }

  return children;
}
