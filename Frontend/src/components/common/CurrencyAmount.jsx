import { TokenIcon } from '@/components/common/TokenIcon';
import { cn } from '@/utils/cn';

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

/**
 * Consistent money/token presentation used anywhere a settlement currency
 * amount is shown. The icon is intentionally placed before the numeric amount
 * so values remain easy to scan without changing the underlying data.
 */
export function CurrencyAmount({
  symbol = 'USDC',
  children,
  className,
  iconSize = 'xs',
  showSymbol = true,
}) {
  const normalizedSymbol = normalizeSymbol(symbol) || 'USDC';

  return (
    <span className={cn('currency-amount', className)}>
      <TokenIcon symbol={normalizedSymbol} size={iconSize} />
      <span className="currency-amount__value">{children}</span>
      {showSymbol ? <span className="currency-amount__symbol">{normalizedSymbol}</span> : null}
    </span>
  );
}

export default CurrencyAmount;
