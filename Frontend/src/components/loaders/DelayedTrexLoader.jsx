import { useEffect, useState } from 'react';
import { TrexLoader } from '@/components/loaders/TrexLoader';

/**
 * Avoid flashing a full-screen loader for work that finishes within a fraction
 * of a second. This is especially important when route lazy-loading and data
 * guards resolve back-to-back during onboarding/navigation.
 */
export function DelayedTrexLoader({ delay = 220, ...props }) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) {
      setVisible(true);
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;
  return <TrexLoader {...props} />;
}

export function WorkspaceRouteLoader({ delay = 180 }) {
  return (
    <DelayedTrexLoader
      delay={delay}
      variant="route"
      compact
      eyebrow="Secure workspace"
      title="Opening your workspace"
      message="Loading your latest T-REX workspace data…"
    />
  );
}
