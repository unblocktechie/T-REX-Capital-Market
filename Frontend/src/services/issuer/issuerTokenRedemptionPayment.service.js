/**
 * Legacy issuer-payment entry point retained as a defensive compatibility
 * guard. Redemption settlement must never be sent with an issuer-signed ERC-20
 * transfer. The issuer only grants USDT allowance to the Platform Controller;
 * the issuer executes controller.redeem(investor, token, tokenAmount), which
 * burns the investor's tokens and transfers USDT from the issuer to that same
 * investor atomically. No standalone ERC-20 payment transaction is permitted.
 *
 * Current issuer UI uses approvePlatformRedemptionFunding() and
 * submitPlatformRedemption() from the Platform Controller service instead of
 * this legacy function.
 */
export const isIssuerRedemptionWalletRejection = (error) => {
  const code = error?.code ?? error?.cause?.code ?? error?.data?.originalError?.code;
  const text = `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();
  return code === 4001 || /user rejected|user denied|request rejected|rejected the request/.test(text);
};

export async function submitIssuerRedemptionPayment() {
  const error = new Error(
    'This payment method is not available. Complete the redemption from the organization’s Privy secure account in T-REX.',
  );
  error.code = 'ISSUER_DIRECT_REDEMPTION_PAYMENT_DISABLED';
  throw error;
}
