import { useState } from 'react';
import usdcCoinIcon from '@/assets/icons/usdc-coin.svg';
import usdtCoinIcon from '@/assets/icons/usdt-coin.svg';
import { cn } from '@/utils/cn';

const sizeClasses = Object.freeze({
  xs: 'token-icon--xs',
  sm: 'token-icon--sm',
  md: 'token-icon--md',
  lg: 'token-icon--lg',
});

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

export function TokenIcon({ symbol, name, imageUrl = '', size = 'md', className }) {
  const [imageFailed, setImageFailed] = useState(false);
  const normalized = normalizeSymbol(symbol);
  const label = name || (normalized === 'USDC' ? 'USD Coin' : normalized === 'USDT' ? 'Tether USDt' : normalized || 'Token');
  const fallback = (normalized || label)
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, normalized.length > 2 ? 3 : 2)
    .toUpperCase() || 'T';
  const isUsdc = normalized === 'USDC';
  const isUsdt = normalized === 'USDT';
  const resolvedImageUrl = isUsdc ? usdcCoinIcon : isUsdt ? usdtCoinIcon : imageUrl;
  const showImage = Boolean(resolvedImageUrl) && !imageFailed;

  return (
    <span
      className={cn(
        'token-icon',
        sizeClasses[size] || sizeClasses.md,
        isUsdc && 'token-icon--usdc',
        isUsdt && 'token-icon--usdt',
        showImage && 'token-icon--image',
        className,
      )}
      role="img"
      aria-label={`${label} token`}
      title={`${label}${normalized && normalized !== label ? ` (${normalized})` : ''}`}
    >
      {showImage ? (
        <img src={resolvedImageUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span aria-hidden="true">{fallback}</span>
      )}
    </span>
  );
}

export default TokenIcon;
