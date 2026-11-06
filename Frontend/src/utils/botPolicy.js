// Policy rules are enforced by the server. These checks provide immediate,
// accessible feedback only and must never substitute for server validation.
export const POLICY_FIELDS = [
  'threshold', 'maxCumulative24hPercent', 'cooldownSeconds', 'frequency',
  'allowedDays', 'startTime', 'endTime', 'timezone', 'allowedIps',
];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const POLICY_SECTION_FIELDS = Object.freeze({
  network: ['allowedIps'],
  protection: ['threshold', 'maxCumulative24hPercent'],
  schedule: ['cooldownSeconds', 'frequency', 'allowedDays', 'startTime', 'endTime', 'timezone'],
});
// API contract: []/null means every UTC day; UI should show all seven selected.
export const visibleAllowedDays = (days) => !days?.length ? [...WEEKDAYS] : WEEKDAYS.filter((day) => days.includes(day));
export const DEFAULT_POLICY_LIMITS = Object.freeze({
  cooldownMin: 30, cooldownMax: 2592000, ipMin: 1, ipMax: 3,
});

const value = (v) => (v === null || v === undefined ? '' : String(v));
export const splitIps = (input) => Array.isArray(input)
  ? input.map((v) => value(v).trim()).filter(Boolean)
  : value(input).split(/[\n,]+/).map((v) => v.trim()).filter(Boolean);

export function normalizePolicy(raw) {
  const policy = raw && typeof raw === 'object' ? raw : {};
  return {
    threshold: value(policy.threshold),
    maxCumulative24hPercent: value(policy.maxCumulative24hPercent),
    cooldownSeconds: value(policy.cooldownSeconds),
    frequency: value(policy.frequency),
    allowedDays: Array.isArray(policy.allowedDays) ? policy.allowedDays.filter((d) => WEEKDAYS.includes(d)) : [],
    startTime: value(policy.startTime),
    endTime: value(policy.endTime),
    timezone: value(policy.timezone),
    allowedIps: splitIps(policy.allowedIps).join('\n'),
  };
}

// Only show a tab-level warning when its actual draft differs from the saved policy.
// An uncommitted IP in the add-address control also counts as an unsaved edit.
export function getUnsavedPolicySections(draft, saved, pendingIp = '') {
  const current = normalizePolicy(draft);
  const original = normalizePolicy(saved);
  const differences = Object.fromEntries(Object.entries(POLICY_SECTION_FIELDS).map(([section, fields]) => [
    section,
    fields.some((field) => JSON.stringify(current[field]) !== JSON.stringify(original[field])),
  ]));
  differences.network ||= Boolean(String(pendingIp).trim());
  return differences;
}

// Accept both namespaced DB setting names and the compact API option shape.
export function normalizePolicyOptions(raw) {
  const o = raw?.options || raw?.policyOptions || raw || {};
  const int = (v, fallback) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  const bounds = {
    cooldownMin: int(o.cooldownMinSeconds ?? o.minCooldownSeconds ?? o.cooldownSeconds?.min ?? o.IssuerApiKeyCooldownMinSeconds, DEFAULT_POLICY_LIMITS.cooldownMin),
    cooldownMax: int(o.cooldownMaxSeconds ?? o.maxCooldownSeconds ?? o.cooldownSeconds?.max ?? o.IssuerApiKeyCooldownMaxSeconds, DEFAULT_POLICY_LIMITS.cooldownMax),
    ipMin: int(o.allowedIpsMin ?? o.minAllowedIps ?? o.allowedIps?.min ?? o.IssuerApiKeyAllowedIpsMin, DEFAULT_POLICY_LIMITS.ipMin),
    ipMax: int(o.allowedIpsMax ?? o.maxAllowedIps ?? o.allowedIps?.max ?? o.IssuerApiKeyAllowedIpsMax, DEFAULT_POLICY_LIMITS.ipMax),
  };
  return { ...bounds, valid: bounds.cooldownMin <= bounds.cooldownMax && bounds.ipMin <= bounds.ipMax };
}

// Validate the address format, not its network classification. The backend now
// accepts private addresses as well as public ones. CIDR ranges remain unsupported.
function validIPv4(ip) {
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((part) =>
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}
function validIPv6(ip) {
  if (!ip.includes(':') || ip.includes('%') || ip.includes('/')) return false;

  // IPv4-mapped / embedded IPv6 addresses use two of the eight groups.
  let address = ip;
  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    if (lastColon < 0 || !validIPv4(ip.slice(lastColon + 1))) return false;
    address = `${ip.slice(0, lastColon)}:0:0`;
  }
  if (!/^[0-9a-f:]+$/i.test(address) || address.includes(':::')) return false;
  if ((address.match(/::/g) || []).length > 1) return false;
  if ((address.startsWith(':') && !address.startsWith('::')) ||
      (address.endsWith(':') && !address.endsWith('::'))) return false;

  const groups = address.split(':').filter(Boolean);
  if (!groups.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) return false;
  return address.includes('::') ? groups.length < 8 : groups.length === 8;
}
export const isValidIpAddress = (ip) => validIPv4(ip) || validIPv6(ip);

export function validateAllowedIps(ips, bounds = DEFAULT_POLICY_LIMITS) {
  const values = splitIps(ips);
  if (values.length < bounds.ipMin || values.length > bounds.ipMax) {
    return `Enter ${bounds.ipMin}–${bounds.ipMax} IP ${bounds.ipMax === 1 ? 'address' : 'addresses'}.`;
  }
  if (new Set(values.map((ip) => ip.toLowerCase())).size !== values.length) return 'Remove duplicate IP addresses.';
  if (values.some((ip) => !isValidIpAddress(ip))) return 'Enter valid IPv4 or IPv6 addresses (CIDR ranges are not supported).';
  return '';
}
export function validatePolicy(draft, bounds = DEFAULT_POLICY_LIMITS) {
  const error = validateAllowedIps(draft.allowedIps, bounds);
  if (error) return error;
  for (const field of ['threshold', 'maxCumulative24hPercent']) {
    const v = value(draft[field]).trim();
    if (v && (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(v) || Number(v) <= 0 || Number(v) > 100)) {
      return `${field === 'threshold' ? 'Price change limit' : '24-hour cumulative limit'} must be greater than 0 and at most 100%, with up to two decimal places.`;
    }
  }
  const cooldown = value(draft.cooldownSeconds).trim();
  if (cooldown && (!/^\d+$/.test(cooldown) || !Number.isSafeInteger(Number(cooldown)) || Number(cooldown) < bounds.cooldownMin || Number(cooldown) > bounds.cooldownMax)) {
    return `Cooldown must be a whole number between ${bounds.cooldownMin} and ${bounds.cooldownMax} seconds.`;
  }
  if (draft.frequency && !['hourly', 'daily', 'weekly', 'monthly'].includes(draft.frequency)) return 'Choose a supported update frequency.';
  if (draft.allowedDays?.length && (new Set(draft.allowedDays).size !== draft.allowedDays.length || draft.allowedDays.some((d) => !WEEKDAYS.includes(d)))) return 'Select valid, unique weekdays.';
  if (Boolean(draft.startTime) !== Boolean(draft.endTime)) return 'Enter both a start time and an end time.';
  if (draft.startTime && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime))) return 'Enter valid start and end times in HH:mm format.';
  if (draft.startTime && draft.startTime === draft.endTime) return 'Start and end times must be different. Overnight windows are allowed.';
  if (draft.timezone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: draft.timezone }); } catch { return 'Enter a valid IANA timezone (for example, Asia/Kolkata).'; }
  }
  return '';
}
export function serializePolicy(draft) {
  const optional = (field) => value(draft[field]).trim() || null;
  return {
    threshold: optional('threshold'),
    maxCumulative24hPercent: optional('maxCumulative24hPercent'),
    cooldownSeconds: optional('cooldownSeconds'),
    frequency: optional('frequency'),
    allowedDays: draft.allowedDays?.length ? [...draft.allowedDays] : null,
    startTime: optional('startTime'),
    endTime: optional('endTime'),
    timezone: optional('timezone'),
    allowedIps: splitIps(draft.allowedIps),
  };
}
export function isKeyActive(key) {
  if (!key || key.revokedAt || key.isRevoked || ['REVOKED', 'EXPIRED', 'DISABLED', 'INACTIVE'].includes(String(key.status || '').toUpperCase())) return false;
  const expiry = key.expiresAt || key.expiryAt || key.expiresOn;
  return !expiry || (Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > Date.now());
}
export function hasConfiguredAllowlist(key, bounds = DEFAULT_POLICY_LIMITS) {
  const ips = key?.policy?.allowedIps;
  return isKeyActive(key) && Array.isArray(ips) && !validateAllowedIps(ips, bounds);
}
