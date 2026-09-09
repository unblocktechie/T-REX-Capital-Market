import * as CountryFlags from 'country-flag-icons/react/3x2';
import { Globe2 } from 'lucide-react';
import { cn } from '@/utils/cn';

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

/**
 * Generic ISO-3166 alpha-2 SVG flag renderer.
 * The API supplies organizationCountryCode (for example "US").
 */
export function CountryFlagIcon({ countryCode, countryName, className, fallbackSize = 18 }) {
  const code = normalizeCode(countryCode);
  const Flag = /^[A-Z]{2}$/.test(code) ? CountryFlags[code] : null;

  if (!Flag) {
    return (
      <span className={cn('country-flag-icon country-flag-icon--fallback', className)} aria-hidden="true">
        <Globe2 size={fallbackSize} />
      </span>
    );
  }

  return (
    <span className={cn('country-flag-icon', className)} title={countryName || code}>
      <Flag aria-label={countryName ? `${countryName} flag` : `${code} flag`} />
    </span>
  );
}
