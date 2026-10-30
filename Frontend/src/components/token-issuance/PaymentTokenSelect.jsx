import { SelectField } from '@/components/organization/OrganizationFields';
import { TokenIcon } from '@/components/common/TokenIcon';
import { resolveMasterImageUrl } from '@/utils/masterImage';

const paymentTokenDisplayName = (token) =>
  token?.name !== token?.symbol
    ? token?.name
    : ({ USDT: 'Tether USD', USDC: 'USD Coin' }[token?.symbol] || token?.symbol);

export function PaymentTokenSelect({
  items,
  className = '',
  compact = false,
  networkLabel = '',
  ...props
}) {
  const tokenFor = (option) =>
    items.find((item) => item.contractAddress === option.value);

  const optionContent = (option) => {
    const token = tokenFor(option);
    const displayName = paymentTokenDisplayName(token);

    return (
      <span className="payment-token-choice">
        <span aria-hidden="true">
          <TokenIcon symbol={token?.symbol} name={displayName} imageUrl={resolveMasterImageUrl(token)} size="sm" />
        </span>
        <span className="payment-token-choice__text">
          <strong>{token?.symbol || option.label}</strong>
          {displayName && displayName !== token?.symbol ? <small>{displayName}</small> : null}
        </span>
      </span>
    );
  };

  const valueContent = (option) => {
    if (!compact) return optionContent(option);

    const token = tokenFor(option);
    const displayName = paymentTokenDisplayName(token);

    return (
      <span className="payment-token-choice payment-token-choice--compact-value">
        <span aria-hidden="true">
          <TokenIcon symbol={token?.symbol} name={displayName} imageUrl={resolveMasterImageUrl(token)} size="sm" />
        </span>
        <span className="payment-token-choice__compact-text">
          <strong>{token?.symbol || option.label}</strong>
          {displayName && displayName !== token?.symbol ? (
            <small className="payment-token-choice__compact-name">{displayName}</small>
          ) : null}
        </span>
        {networkLabel ? (
          <span
            className="payment-token-choice__network"
            title={`Network: ${networkLabel}`}
            aria-label={`Network: ${networkLabel}`}
          >
            {networkLabel}
          </span>
        ) : null}
      </span>
    );
  };

  const selectClassName = [
    'payment-token-select',
    compact ? 'payment-token-select--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <SelectField
      {...props}
      className={selectClassName}
      options={items.map((item) => ({
        value: item.contractAddress,
        label: item.symbol,
      }))}
      renderOption={optionContent}
      renderValue={valueContent}
      searchable={false}
      showEmptyOption={false}
    />
  );
}
