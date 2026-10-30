import { parseUnits } from 'viem';

export function parseExactUnits(value, decimals) {
  const input = String(value ?? '').trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36
    || !/^\d+(?:\.\d+)?$/.test(input) || (input.split('.')[1]?.length || 0) > decimals) {
    throw new Error(`Enter a valid amount with at most ${decimals} decimal places.`);
  }
  const raw = parseUnits(input, decimals);
  if (raw <= 0n || raw > (1n << 256n) - 1n) throw new Error('Amount must be greater than zero and fit within uint256.');
  return raw;
}

export function calculatePaymentRaw(amount, price, tokenDecimals, paymentDecimals, priceDecimals) {
  const normalized = (amount * price) / (10n ** BigInt(tokenDecimals));
  return (normalized * 10n ** BigInt(paymentDecimals)) / (10n ** BigInt(priceDecimals));
}
