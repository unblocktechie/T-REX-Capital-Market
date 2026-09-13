import { useState } from 'react';
import { Network } from 'lucide-react';
import { cn } from '@/utils/cn';

const ARC_NETWORK_ICON_URL = 'https://testnet.arcscan.app/assets/configs/network_icon.svg';

const sizeClasses = Object.freeze({
  xs: 'arc-network-icon--xs',
  sm: 'arc-network-icon--sm',
  md: 'arc-network-icon--md',
});

export function ArcNetworkIcon({ size = 'sm', className, decorative = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = 'Arc Testnet network';

  return (
    <span
      className={cn('arc-network-icon', sizeClasses[size] || sizeClasses.sm, className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? 'true' : undefined}
      title={decorative ? undefined : label}
    >
      {!imageFailed ? (
        <img
          src={ARC_NETWORK_ICON_URL}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Network aria-hidden="true" />
      )}
    </span>
  );
}

export default ArcNetworkIcon;
