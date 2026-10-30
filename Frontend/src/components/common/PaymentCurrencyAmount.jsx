import { CurrencyAmount } from '@/components/common/CurrencyAmount';
import { usePaymentTokenMetadata } from '@/hooks/usePaymentTokenMetadata';

/**
 * CurrencyAmount backed by the authoritative selected-chain payment-token
 * catalogue. This keeps custom payment-token artwork (for example USDG) in
 * sync with the image configured by the backend instead of relying only on
 * built-in symbol artwork.
 */
export function PaymentCurrencyAmount({
  paymentTokenAddress = '',
  paymentTokenSymbol = '',
  chainUid = '',
  chainId = null,
  enabled = true,
  children,
  ...amountProps
}) {
  const paymentToken = usePaymentTokenMetadata({
    paymentTokenAddress,
    paymentTokenSymbol,
    chainUid,
    chainId,
    enabled,
  });

  const symbol = paymentToken.symbol || String(paymentTokenSymbol || '').trim().toUpperCase();

  return (
    <CurrencyAmount
      {...amountProps}
      symbol={symbol}
      name={paymentToken.name}
      imageUrl={paymentToken.imageUrl}
    >
      {children}
    </CurrencyAmount>
  );
}

export default PaymentCurrencyAmount;
