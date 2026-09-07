import { TrexMiniLoader } from '@/components/loaders/TrexLoader';

export function Spinner({ size = 24, label = 'Loading' }) {
  return (
    <TrexMiniLoader
      label={label}
      className="spinner"
      style={{ '--trex-spinner-size': `${size}px` }}
    />
  );
}
