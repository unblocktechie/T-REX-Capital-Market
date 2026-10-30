import { useMemo, useState } from 'react';
import { Coins, DollarSign } from 'lucide-react';
import ethCoinIcon from '@/assets/icons/eth-coin.svg';
import usdcCoinIcon from '@/assets/icons/usdc-coin.svg';
import usdtCoinIcon from '@/assets/icons/usdt-coin.svg';
import { cn } from '@/utils/cn';
import { resolveApiAssetUrl } from '@/utils/apiAssetUrl';

const sizeClasses = Object.freeze({
  xs: 'token-icon--xs',
  sm: 'token-icon--sm',
  md: 'token-icon--md',
  lg: 'token-icon--lg',
});

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

export function TokenIcon({
  symbol,
  name,
  imageUrl = '',
  size = 'md',
  className,
  fallback = 'token',
  useBuiltInImages = true,
}) {
  const [failedImageUrls, setFailedImageUrls] = useState([]);
  const normalized = normalizeSymbol(symbol);
  const label = name || (normalized === 'USDC' ? 'USD Coin' : normalized === 'USDT' ? 'Tether USDt' : normalized || 'Token');
  const fallbackText = (normalized || label)
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, normalized.length > 2 ? 3 : 2)
    .toUpperCase() || 'T';
  const isEth = normalized === 'ETH';
  const isUsdc = normalized === 'USDC';
  const isUsdt = normalized === 'USDT';
  const builtInImageUrl = useBuiltInImages ? (isUsdc ? usdcCoinIcon : isUsdt ? usdtCoinIcon : isEth ? ethCoinIcon : '') : '';
  const backendImageUrl = resolveApiAssetUrl(imageUrl);
  const candidates = useMemo(
    () => [...new Set([backendImageUrl, builtInImageUrl].filter(Boolean))],
    [backendImageUrl, builtInImageUrl],
  );
  const resolvedImageUrl = candidates.find((candidate) => !failedImageUrls.includes(candidate)) || '';
  const showImage = Boolean(resolvedImageUrl);
  const showCurrencyFallback = !showImage && fallback === 'currency';
  const showIconFallback = !showImage && fallback === 'icon';

  return (
    <span
      className={cn(
        'token-icon',
        sizeClasses[size] || sizeClasses.md,
        isUsdc && 'token-icon--usdc',
        isUsdt && 'token-icon--usdt',
        showImage && 'token-icon--image',
        showCurrencyFallback && 'token-icon--currency-fallback',
        showIconFallback && 'token-icon--generic-fallback',
        className,
      )}
      role="img"
      aria-label={`${label} token`}
      title={`${label}${normalized && normalized !== label ? ` (${normalized})` : ''}`}
    >
      {showImage ? (
        <img
          src={resolvedImageUrl}
          alt=""
          onError={() => setFailedImageUrls((current) => current.includes(resolvedImageUrl) ? current : [...current, resolvedImageUrl])}
        />
      ) : showCurrencyFallback ? (
        <DollarSign aria-hidden="true" />
      ) : showIconFallback ? (
        <Coins aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{fallbackText}</span>
      )}
    </span>
  );
}

export default TokenIcon;
