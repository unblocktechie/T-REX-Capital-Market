import { TrexLoader } from '@/components/loaders/TrexLoader';
import { useUiStore } from '@/store/ui.store';

export function GlobalLoader() {
  const pendingRequests = useUiStore((state) => state.pendingRequests);
  if (!pendingRequests) return null;

  return (
    <div className="global-loader" aria-hidden="false">
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
