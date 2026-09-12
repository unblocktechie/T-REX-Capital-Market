const clean = (value) => String(value ?? '').trim();

const nestedValue = (error, key) => (
  error?.[key]
  ?? error?.cause?.[key]
  ?? error?.data?.originalError?.[key]
  ?? error?.cause?.data?.originalError?.[key]
);

const errorCode = (error) => clean(nestedValue(error, 'code')).toUpperCase();

const errorText = (error) => [
  error?.shortMessage,
  error?.details,
  error?.message,
  error?.cause?.shortMessage,
  error?.cause?.details,
  error?.cause?.message,
].filter(Boolean).join(' ').toLowerCase();

const hasZeroNativeBalance = (balance) => {
  const value = balance?.value;
  if (typeof value === 'bigint') return value === 0n;
  if (typeof value === 'number') return Number.isFinite(value) && value === 0;
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value) === 0n;
  return false;
};

const PAYMENT_BALANCE_CODES = new Set([
  'INSUFFICIENT_INVESTOR_BALANCE',
  'INSUFFICIENT_ISSUER_BALANCE',
  'INSUFFICIENT_PAYMENT_TOKEN_BALANCE',
]);

const NATIVE_BALANCE_CODES = new Set([
  'INSUFFICIENT_NATIVE_BALANCE',
  'INSUFFICIENT_GAS_BALANCE',
]);

export function getWalletFundingIssue(error, context = {}) {
  if (!error) return null;

  const structured = error?.fundingIssue && typeof error.fundingIssue === 'object'
    ? error.fundingIssue
    : {};
  const code = errorCode(error);
  const text = errorText(error);

  const paymentInsufficient = Boolean(
    structured.paymentInsufficient
    || PAYMENT_BALANCE_CODES.has(code)
    || /(?:payment token|usdt|usdc|stablecoin).{0,45}(?:balance|funds).{0,45}(?:low|insufficient|not enough|does not have enough)/i.test(text)
    || /(?:balance|funds).{0,45}(?:low|insufficient|not enough).{0,45}(?:payment token|usdt|usdc|stablecoin)/i.test(text)
  );

  const nativeInsufficient = Boolean(
    structured.nativeInsufficient
    || NATIVE_BALANCE_CODES.has(code)
    || /insufficient funds(?: for gas| for intrinsic transaction cost| for transfer)?/i.test(text)
    || /insufficient (?:native )?balance.{0,40}(?:gas|network fee)/i.test(text)
    || /(?:gas|network fee).{0,40}(?:insufficient funds|insufficient balance|not enough)/i.test(text)
  );

  if (!paymentInsufficient && !nativeInsufficient && code !== 'INSUFFICIENT_WALLET_BALANCE') {
    return null;
  }

  const nativeBalanceEmpty = hasZeroNativeBalance(context.nativeBalance);
  const type = code === 'INSUFFICIENT_WALLET_BALANCE'
    || structured.type === 'both'
    || (paymentInsufficient && (nativeInsufficient || nativeBalanceEmpty))
    ? 'both'
    : paymentInsufficient
      ? 'payment'
      : 'gas';

  return {
    type,
    paymentSymbol: clean(structured.paymentSymbol || context.paymentSymbol) || 'payment token',
    requiredPayment: clean(structured.requiredPayment || context.requiredPayment),
    availablePayment: clean(structured.availablePayment || context.availablePayment),
    walletAddress: clean(structured.walletAddress || context.walletAddress),
    networkName: clean(structured.networkName || context.networkName) || 'the configured network',
    nativeSymbol: clean(structured.nativeSymbol || context.nativeSymbol) || 'native token',
    nativeBalanceLabel: clean(structured.nativeBalanceLabel || context.nativeBalanceLabel),
  };
}
