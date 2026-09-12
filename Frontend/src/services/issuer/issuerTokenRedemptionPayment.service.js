/**
 * Legacy issuer-payment entry point retained as a defensive compatibility
 * guard. Redemption settlement must never be sent with an issuer-signed ERC-20
 * transfer. The issuer only grants USDT allowance to the Platform Controller;
 * the investor later signs controller.redeem(), which burns the investor's
 * tokens and transfers USDT from the issuer to that same investor atomically.
 *
 * Current issuer UI uses approvePlatformRedemptionFunding() from the Platform
 * Controller service instead of this legacy function.
 */
export const isIssuerRedemptionWalletRejection = (error) => {
  const code = error?.code ?? error?.cause?.code ?? error?.data?.originalError?.code;
  const text = `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();
  return code === 4001 || /user rejected|user denied|request rejected|rejected the request/.test(text);
};

export async function submitIssuerRedemptionPayment() {
  const error = new Error(
    'Direct issuer-signed redemption payments are disabled. The issuer only approves USDT spending; the investor signs the redemption transaction.',
  );
  error.code = 'ISSUER_DIRECT_REDEMPTION_PAYMENT_DISABLED';
  throw error;
}
