import { formatTokenPriceForDisplay } from '@/utils/tokenPrice';
import { cn } from '@/utils/cn';

/**
 * Single presentation path for token prices across the application.
 * Values remain strings/precise decimals; only the rendered text is truncated.
 */
export function TokenPriceValue({
  value,
  className,
  fallback = '—',
  prefix = '',
  suffix = '',
}) {
  const formatted = formatTokenPriceForDisplay(value);
  if (!formatted.display) return fallback;

  const visible = `${prefix}${formatted.display}${suffix}`;
  const exactLabel = `${prefix}${formatted.exact}${suffix}`;

  return (
    <span
      className={cn('token-price-value', className)}
      title={formatted.isTruncated ? exactLabel : undefined}
      aria-label={formatted.isTruncated ? exactLabel : undefined}
    >
      {visible}
    </span>
  );
}

export default TokenPriceValue;
