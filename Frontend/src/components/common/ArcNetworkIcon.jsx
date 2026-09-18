import { useState } from 'react';
import { Network } from 'lucide-react';
import { web3Config } from '@/config/web3';
import { cn } from '@/utils/cn';

const sizeClasses = Object.freeze({
  xs: 'arc-network-icon--xs',
  sm: 'arc-network-icon--sm',
  md: 'arc-network-icon--md',
});

export function ArcNetworkIcon({ size = 'sm', className, decorative = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = `${web3Config.requiredChain.name} network`;

  return (
    <span
      className={cn('arc-network-icon', sizeClasses[size] || sizeClasses.sm, className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? 'true' : undefined}
      title={decorative ? undefined : label}
    >
      {!imageFailed && web3Config.ui.requiredChainIconUrl ? (
        <img
          src={web3Config.ui.requiredChainIconUrl}
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
