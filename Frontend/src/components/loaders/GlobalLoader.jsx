import { useEffect, useRef, useState } from 'react';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/utils/cn';

// Short requests should be handled by the button/card that started them instead
// of flashing a full-screen overlay. If a request does take longer, keep the
// overlay visible long enough that it feels intentional rather than blinking.
const SHOW_DELAY_MS = 280;
const MIN_VISIBLE_MS = 420;

export function GlobalLoader() {
  const pendingRequests = useUiStore((state) => state.pendingRequests);
  const [visible, setVisible] = useState(false);
  const visibleSinceRef = useRef(0);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (pendingRequests > 0) {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      if (!visible && !showTimerRef.current) {
        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          if (useUiStore.getState().pendingRequests <= 0) return;
          visibleSinceRef.current = performance.now();
          setVisible(true);
        }, SHOW_DELAY_MS);
      }
      return;
    }

    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    if (!visible || hideTimerRef.current) return;

    const elapsed = performance.now() - visibleSinceRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (useUiStore.getState().pendingRequests > 0) return;
      setVisible(false);
    }, remaining);
  }, [pendingRequests, visible]);

  useEffect(
    () => () => {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  return (
    <div
      className={cn('global-loader', visible && 'global-loader--visible')}
      aria-hidden={!visible}
    >
      <TrexLoader
        variant="overlay"
        title="Securing your request"
        message="Synchronizing with the T-REX infrastructure…"
        eyebrow="Encrypted connection"
        compact
      />
    </div>
  );
}
