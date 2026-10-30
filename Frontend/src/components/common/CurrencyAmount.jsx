import { TokenIcon } from '@/components/common/TokenIcon';
import { cn } from '@/utils/cn';

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

/**
 * Consistent money/token presentation used anywhere a settlement currency
 * amount is shown. The icon is intentionally placed before the numeric amount
 * so values remain easy to scan without changing the underlying data.
 */
export function CurrencyAmount({
  symbol = '',
  children,
  className,
  iconSize = 'xs',
  imageUrl = '',
  name = '',
  iconFallback = 'currency',
  useBuiltInIcon = true,
  showSymbol = true,
  title,
  ariaLabel,
}) {
  const normalizedSymbol = normalizeSymbol(symbol) || '—';

  return (
    <span className={cn('currency-amount', className)} title={title} aria-label={ariaLabel}>
      <TokenIcon
        symbol={normalizedSymbol}
        name={name}
        imageUrl={imageUrl}
        size={iconSize}
        fallback={iconFallback}
        useBuiltInImages={useBuiltInIcon}
      />
      <span className="currency-amount__value">{children}</span>
      {showSymbol ? <span className="currency-amount__symbol">{normalizedSymbol}</span> : null}
    </span>
  );
}

export default CurrencyAmount;
