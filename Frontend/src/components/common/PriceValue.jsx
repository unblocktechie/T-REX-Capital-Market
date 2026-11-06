import { ResponsiveTooltip } from '@/components/common/ResponsiveTooltip';
import { cn } from '@/utils/cn';
import { formatPriceDisplay } from '@/utils/priceDisplay';

/**
 * The shared read-only price renderer. Accept raw decimal strings, not already
 * formatted numbers, and shows the full original decimal string on hover/focus (including trailing zeros).
 * Keep editable inputs and financial calculations on their original raw values.
 */
export function PriceValue({
  value,
  className,
  fallback = '—',
  prefix = '',
  suffix = '',
  label = 'Full price',
}) {
  const { display, exact } = formatPriceDisplay(value);
  if (!display) return <span className={className}>{fallback}</span>;
  return <ResponsiveTooltip
    content={`${label}: ${prefix}${exact}${suffix}`}
    ariaLabel={`${label}: ${prefix}${exact}${suffix}`}
    className={cn('token-price-value cursor-help tabular-nums', className)}
  >{prefix}{display}{suffix}</ResponsiveTooltip>;
}

export default PriceValue;
