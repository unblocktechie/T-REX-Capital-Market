// The admin investor endpoints do not advertise server-side sorting for these
// columns. Sort the currently loaded page without mutating React Query data.
const readText = (value) => String(value ?? '').trim();
const compare = (left, right, direction) => {
  const a = readText(left);
  const b = readText(right);
  if (!a || !b) return !a && !b ? 0 : !a ? 1 : -1;
  const order = direction === 'desc' ? -1 : 1;
  return order * a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
};
const displayName = (item) => item.fullName || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email;
const profile = (item) => item.profileStatus || (item.investorUid ? 'Draft' : 'Not started');
const sortCopy = (items, field, direction, fields) => {
  if (!Object.hasOwn(fields, field)) return items;
  return [...items].sort((left, right) => compare(fields[field](left), fields[field](right), direction));
};

export function sortAdminInvestorPage(items, field = '', direction = 'asc') {
  return sortCopy(items, field, direction, {
    investor: displayName,
    emailVerified: (r) => r.emailVerified ? 'Verified' : 'Pending',
    profileStatus: profile,
    isActive: (r) => r.isActive === false ? 'Inactive' : 'Active',
  });
}

export function sortAdminInvestorChainPage(items, field = '', direction = 'asc') {
  if (field === 'unlockedAt') {
    const sign = direction === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      const left = Date.parse(a.unlockedAt || '');
      const right = Date.parse(b.unlockedAt || '');
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        return !Number.isFinite(left) && !Number.isFinite(right) ? 0 : !Number.isFinite(left) ? 1 : -1;
      }
      return sign * (left - right);
    });
  }
  return sortCopy(items, field, direction, {
    chainName: (r) => r.chainName || r.chainId,
    status: (r) => r.status || 'LOCKED',
    isUnlocked: (r) => r.isUnlocked ? 'Unlocked' : 'Locked',
  });
}

export function investorInitials(value) {
  const parts = readText(value).split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] || 'IN').slice(0, 2)).toUpperCase();
}

// Match the Organization list: use the first two words (e.g. Barron Jenkins
// Associates -> BJ), rather than the first and last words used for people.
export function issuerInitials(value) {
  const words = readText(value).split(/\s+/).filter(Boolean);
  return (words.length ? words.slice(0, 2).map((word) => word[0]).join('') : 'OR').toUpperCase();
}

// These detail endpoints currently paginate on the server without exposing
// sorting options. Sort a copied page only; do not modify the fetched records.
const compareDate = (left, right, direction) => {
  const a = Date.parse(left || '');
  const b = Date.parse(right || '');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return !Number.isFinite(a) && !Number.isFinite(b) ? 0 : !Number.isFinite(a) ? 1 : -1;
  return (direction === 'desc' ? -1 : 1) * (a - b);
};

// Compare monetary decimal strings without converting to a lossy JS Number.
const decimalParts = (value) => {
  const text = String(value ?? '').trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] || '').replace(/0+$/, '');
  return { negative: match[1] === '-' && (whole !== '0' || fraction !== ''), whole, fraction };
};
const compareDecimals = (left, right, direction) => {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return !a && !b ? 0 : !a ? 1 : -1;
  let result;
  if (a.negative !== b.negative) result = a.negative ? -1 : 1;
  else {
    const wholeOrder = a.whole.length - b.whole.length || a.whole.localeCompare(b.whole);
    const places = Math.max(a.fraction.length, b.fraction.length);
    const fractions = a.fraction.padEnd(places, '0').localeCompare(b.fraction.padEnd(places, '0'));
    result = (a.negative ? -1 : 1) * (wholeOrder || fractions);
  }
  return (direction === 'desc' ? -1 : 1) * result;
};
const tokenLabel = (r) => r.tokenName || r.token?.name || r.tokenSymbol;
const issuerLabel = (r) => r.legalCompanyName || r.issuerName || r.issuer?.legalCompanyName || r.organizationName;
export function sortAdminInvestorTokenPage(items, field = '', direction = 'asc') {
  if (field === 'currentTokenPrice') return [...items].sort((a, b) => compareDecimals(a.currentTokenPrice, b.currentTokenPrice, direction));
  return sortCopy(items, field, direction, {
    tokenName: tokenLabel,
    issuerName: issuerLabel,
    chainName: (r) => r.chainName || r.chainId,
  });
}
export function sortAdminInvestorApplicationPage(items, field = '', direction = 'asc') {
  if (field === 'submittedAt') return [...items].sort((a, b) => compareDate(a.submittedAt || a.createdAt, b.submittedAt || b.createdAt, direction));
  return sortCopy(items, field, direction, {
    tokenName: tokenLabel,
    issuerName: issuerLabel,
    chainName: (r) => r.chainName || r.chainId,
    status: (r) => r.status,
  });
}
