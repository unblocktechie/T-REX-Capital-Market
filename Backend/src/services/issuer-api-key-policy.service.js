const ipaddr = require('ipaddr.js');
const crypto = require('node:crypto');
const { execute } = require('../database/connection');
const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');
const { positiveSetting } = require('../utils/positive-setting');
const { booleanSetting } = require('../utils/boolean-setting');
const { policy: schema } = require('../schemas/issuer-api-key-policy.schema');
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const normalizeIp = (value, allowPrivate = false) => {
  if (!value || String(value).includes('%') || !ipaddr.isValid(value)) return null;
  let address = ipaddr.parse(value);
  if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address();
  return address.range() === 'unicast' || (allowPrivate && ['private', 'uniqueLocal'].includes(address.range()))
    ? address.toNormalizedString() : null;
};
const deny = (code, message) => { throw new ApiError(403, message, undefined, code); };
class IssuerApiKeyPolicyService {
  constructor({ settingRepository, query = execute, pool = () => ({ getConnection: async () => {
    // Dedicated lock connection avoids starving the query pool while broadcasts wait.
    const connection = await mysql.createConnection({ host: env.database.host, port: env.database.port,
      database: env.database.name, user: env.database.user, password: env.database.password, connectTimeout: 5000 });
    connection.release = () => connection.end();
    return connection;
  } }), now = () => new Date() }) {
    Object.assign(this, { settingRepository, query, pool, now });
  }
  async limits(executor) {
    const defaults = { IssuerApiKeyCooldownMinSeconds: 30, IssuerApiKeyCooldownMaxSeconds: 2592000,
      IssuerApiKeyAllowedIpsMin: 1, IssuerApiKeyAllowedIpsMax: 3 };
    const values = {};
    values.IssuerApiKeyAllowPrivateIps = await booleanSetting(this.settingRepository, 'IssuerApiKeyAllowPrivateIps', false, executor);
    for (const [key, fallback] of Object.entries(defaults)) values[key] = await positiveSetting(this.settingRepository, key, fallback, executor);
    if (values.IssuerApiKeyAllowedIpsMin > values.IssuerApiKeyAllowedIpsMax
      || values.IssuerApiKeyCooldownMinSeconds > values.IssuerApiKeyCooldownMaxSeconds) {
      throw new ApiError(503, 'API key policy limits are misconfigured.', undefined, 'API_KEY_POLICY_SETTINGS_INVALID');
    }
    return values;
  }
  async get(uid, executor) {
    const [row] = await this.query('SELECT * FROM issuerApiKeyPolicy WHERE issuerApiKeyUid=?', [uid], executor);
    if (!row) return null;
    return { threshold: row.threshold == null ? null : String(row.threshold),
      maxCumulative24hPercent: row.maxCumulative24hPercent == null ? null : String(row.maxCumulative24hPercent),
      cooldownSeconds: row.cooldownSeconds == null ? null : String(row.cooldownSeconds), frequency: row.frequency,
      allowedDays: json(row.allowedDays), startTime: row.startTime, endTime: row.endTime,
      timezone: row.timezone, allowedIps: json(row.allowedIps) };
  }
  async save(uid, input, executor) {
    const parsed = schema.validate(input, { abortEarly: false });
    if (parsed.error) throw new ApiError(422, 'API key policy validation failed.', parsed.error.details.map(d => ({ field: d.path.join('.'), message: d.message })), 'VALIDATION_ERROR');
    const value = parsed.value;
    const limits = await this.limits(executor);
    const ips = value.allowedIps.map(ip => normalizeIp(ip, limits.IssuerApiKeyAllowPrivateIps));
    if (ips.some(ip => !ip) || new Set(ips).size !== ips.length
      || ips.length < limits.IssuerApiKeyAllowedIpsMin || ips.length > limits.IssuerApiKeyAllowedIpsMax) {
      throw new ApiError(422, `Provide ${limits.IssuerApiKeyAllowedIpsMin}–${limits.IssuerApiKeyAllowedIpsMax} unique ${limits.IssuerApiKeyAllowPrivateIps ? 'public or private' : 'public'} IPv4 or IPv6 addresses.`, undefined, 'INVALID_ALLOWED_IPS');
    }
    if (value.cooldownSeconds != null && (!Number.isSafeInteger(Number(value.cooldownSeconds))
      || Number(value.cooldownSeconds) < limits.IssuerApiKeyCooldownMinSeconds || Number(value.cooldownSeconds) > limits.IssuerApiKeyCooldownMaxSeconds)) {
      throw new ApiError(422, `cooldownSeconds must be between ${limits.IssuerApiKeyCooldownMinSeconds} and ${limits.IssuerApiKeyCooldownMaxSeconds}.`, undefined, 'INVALID_COOLDOWN');
    }
    const fields = ['threshold','maxCumulative24hPercent','cooldownSeconds','frequency','allowedDays','startTime','endTime','timezone','allowedIps'];
    const values = fields.map(field => field === 'allowedIps' ? JSON.stringify(ips)
      : field === 'allowedDays' ? (value[field] == null ? null : JSON.stringify(value[field]))
        : field === 'timezone' ? value[field] || 'UTC' : value[field] ?? null);
    await this.query(`INSERT INTO issuerApiKeyPolicy (issuerApiKeyUid,${fields.join(',')})
      VALUES (${Array(10).fill('?').join(',')}) ON DUPLICATE KEY UPDATE
      ${fields.map(field => `${field}=VALUES(${field})`).join(',')},updatedAt=UTC_TIMESTAMP(3)`, [uid, ...values], executor);
    return this.get(uid, executor);
  }
  async assertIp(uid, ip) {
    const policy = await this.get(uid);
    const allowPrivate = await booleanSetting(this.settingRepository, 'IssuerApiKeyAllowPrivateIps');
    const actual = normalizeIp(ip, allowPrivate);
    if (!policy?.allowedIps?.length) deny('API_KEY_IP_ALLOWLIST_REQUIRED', 'Configure this API key IP allowlist on the website first.');
    if (!actual || !policy.allowedIps.some(value => normalizeIp(value, allowPrivate) === actual)) deny('API_KEY_IP_NOT_ALLOWED', 'This IP address is not allowed for this API key.');
  }
  // MySQL named lock spans validation, persistence and broadcast across backend instances.
  async acquire(tokenUid) {
    const connection = await this.pool().getConnection();
    const name = 'pricePolicy:' + crypto.createHash('sha256').update(tokenUid).digest('hex').slice(0, 48);
    try {
      const [[row]] = await connection.query('SELECT GET_LOCK(?,5) AS acquired', [name]);
      if (Number(row.acquired) !== 1) throw new ApiError(409, 'Another price update is being processed. Try again later.', undefined, 'PRICE_POLICY_BUSY');
    } catch (error) { await connection.release(); throw error; }
    return async () => {
      try { await connection.query('SELECT RELEASE_LOCK(?)', [name]); } finally { await connection.release(); }
    };
  }
  async check(uid, token, currentRaw, newRaw, priceDecimals) {
    const policy = await this.get(uid);
    if (!policy?.allowedIps?.length) deny('API_KEY_IP_ALLOWLIST_REQUIRED', 'Configure this API key IP allowlist first.');
    const now = this.now();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: policy.timezone || 'UTC',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    if (policy.allowedDays && !policy.allowedDays.includes(parts.weekday)) deny('PRICE_DAY_NOT_ALLOWED', 'Price updates are not allowed on this weekday.');
    const time = `${parts.hour}:${parts.minute}`;
    if (policy.startTime) {
      const allowed = policy.startTime < policy.endTime
        ? time >= policy.startTime && time < policy.endTime
        : time >= policy.startTime || time < policy.endTime;
      if (!allowed) deny('PRICE_TIME_NOT_ALLOWED', 'Price updates are outside the configured time window.');
    }
    const percentUnits = value => BigInt(Math.round(Number(value) * 100));
    const abs = value => value < 0n ? -value : value;
    const current = BigInt(currentRaw); const next = BigInt(newRaw);
    if (policy.threshold != null && (current <= 0n || abs(next - current) * 10000n > current * percentUnits(policy.threshold))) {
      deny('PRICE_THRESHOLD_EXCEEDED', 'Price change exceeds the configured per-update percentage.');
    }
    const rows = await this.query(`SELECT status,oldPriceRaw,newPriceRaw,confirmedAt,submittedAt,createdAt,submissionMode
      FROM tokenPriceUpdate WHERE tokenUid=? AND chainUid=? AND isDeleted=0
        AND ((status='CONFIRMED' AND isCanonical=1) OR (submissionMode='RELAYED' AND status IN ('PENDING','SUBMITTED')))
      ORDER BY COALESCE(confirmedAt,submittedAt,createdAt) DESC,blockNumber DESC,logIndex DESC`, [token.tokenUid, token.chainUid]);
    if (rows.some(row => ['PENDING','SUBMITTED'].includes(row.status))) {
      throw new ApiError(409, 'A previous automated price update is awaiting confirmation.', undefined, 'PRICE_UPDATE_IN_PROGRESS');
    }
    if ((policy.threshold != null || policy.maxCumulative24hPercent != null) && priceDecimals != null) {
      const last = rows.find(row => row.status === 'CONFIRMED');
      let baseline = last?.newPriceRaw;
      if (baseline == null && !last) {
        const [initial] = await this.query('SELECT CAST(initialTokenPrice AS CHAR) AS price FROM tokenMaster WHERE tokenUid=? AND chainUid=? AND isDeleted=0', [token.tokenUid, token.chainUid]);
        baseline = initial?.price == null ? null : ethers.parseUnits(initial.price, priceDecimals);
      }
      if (baseline == null || BigInt(baseline) !== current) deny('PRICE_BASELINE_UNAVAILABLE', 'Wait for confirmed price history to synchronize before updating again.');
    }
    const automated = rows.find(row => row.submissionMode === 'RELAYED');
    if (automated) {
      const last = new Date(automated.confirmedAt || automated.submittedAt || automated.createdAt);
      if (policy.cooldownSeconds != null && now - last < Number(policy.cooldownSeconds) * 1000) deny('PRICE_COOLDOWN_ACTIVE', 'The configured cooldown has not elapsed.');
      let until;
      if (policy.frequency === 'monthly') {
        until = new Date(last); const day = until.getUTCDate(); until.setUTCDate(1); until.setUTCMonth(until.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 0)).getUTCDate(); until.setUTCDate(Math.min(day, lastDay));
      } else if (policy.frequency) until = new Date(last.getTime() + { hourly: 3600000, daily: 86400000, weekly: 604800000 }[policy.frequency]);
      if (until && now < until) deny('PRICE_FREQUENCY_EXCEEDED', 'The configured update frequency has not elapsed.');
    }
    if (policy.maxCumulative24hPercent != null) {
      const recent = rows.filter(row => row.status === 'CONFIRMED' && new Date(row.confirmedAt) >= new Date(now - 86400000));
      if (recent.some(row => row.oldPriceRaw == null || row.newPriceRaw == null)) deny('PRICE_BASELINE_UNAVAILABLE', 'Confirmed price history is incomplete for the rolling window.');
      const baseline = recent.length ? BigInt(recent.at(-1).oldPriceRaw) : current;
      const movement = recent.reduce((sum, row) => sum + abs(BigInt(row.newPriceRaw) - BigInt(row.oldPriceRaw)), 0n) + abs(next - current);
      if (baseline <= 0n || movement * 10000n > baseline * percentUnits(policy.maxCumulative24hPercent)) deny('PRICE_CUMULATIVE_LIMIT_EXCEEDED', 'Total absolute price movement exceeds the rolling 24-hour limit.');
    }
  }
}
module.exports = { IssuerApiKeyPolicyService, normalizeIp };
