import { useEffect, useState } from 'react';
import { TrexLoader } from '@/components/loaders/TrexLoader';

/**
 * Keep the delay for non-startup verification flows to prevent loader flashing.
 */
export function DelayedTrexLoader({ delay = 220, ...props }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (delay <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (delay > 0 && !visible) return null;
  return <TrexLoader {...props} />;
}

/**
 * Shared minimal T-REX overlay for true application-level waits such as startup,
 * authentication redirects, workspace bootstrap, and access verification.
 * Ordinary authenticated menu navigation uses an in-content skeleton instead.
 */
export function WorkspaceRouteLoader() {
  return (
    <TrexLoader
      variant="route"
      compact
      title="Opening your workspace"
      message="Loading your latest T-REX workspace data…"
    />
  );
}
