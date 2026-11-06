import { formatPriceText } from './priceDisplay.js';

/** Price presentation is shared across the entire app. */
export const formatAdminTokenPrice = (value) => formatPriceText(value);

/** Only produce external address links for full hexadecimal EVM addresses and a trusted HTTP(S) base. */
export const adminTokenAddressExplorerUrl = (address, explorerBase) => {
  const normalized = String(address ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) return '';
  try {
    const url = new URL(String(explorerBase ?? '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/address/${normalized}`;
  } catch {
    return '';
  }
};
