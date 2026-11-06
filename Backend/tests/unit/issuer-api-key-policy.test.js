const test = require('node:test');
const assert = require('node:assert/strict');
const { IssuerApiKeyPolicyService, normalizeIp } = require('../../src/services/issuer-api-key-policy.service');
const { policy: schema } = require('../../src/schemas/issuer-api-key-policy.schema');
const base = { allowedIps: ['8.8.8.8'], timezone: 'UTC' };
const now = new Date('2026-10-22T12:00:00Z');
function fixture(policy = {}, rows = []) {
  const service = new IssuerApiKeyPolicyService({ settingRepository: { findByKey: async () => null },
    now: () => now, query: async () => rows });
  service.get = async () => ({ ...base, ...policy });
  return service;
}
const token = { tokenUid: 'token', chainUid: 'chain' };
test('null and omitted timezone normalize to UTC in policy and key creation', async () => {
  const { issuerApiKeyCreate } = require('../../src/schemas/organization.schema');
  for (const timezone of [null, undefined, 'UTC', 'Asia/Kolkata']) {
    for (const [validator, input] of [[schema, { allowedIps: ['8.8.8.8'], timezone }],
      [issuerApiKeyCreate, { name: 'Pricing bot', allowedIps: ['8.8.8.8'], timezone }]]) {
      const parsed = validator.validate(input);
      assert.ifError(parsed.error);
      assert.equal(parsed.value.timezone, timezone ?? 'UTC');
    }
  }
  assert.ok(schema.validate({ ...base, timezone: 'not-a-timezone' }).error);
  let saved;
  const service = fixture();
  service.query = async (sql, params) => { if (sql.startsWith('INSERT')) saved = params; return []; };
  await service.save('key', { allowedIps: ['8.8.8.8'], timezone: null });
  assert.equal(saved[8], 'UTC');
});
test('private IP toggle applies to save and authentication and defaults to false', async () => {
  const service = fixture({ allowedIps: ['192.168.29.142'] });
  let enabled = 'false';
  service.settingRepository = { findByKey: async key => key === 'IssuerApiKeyAllowPrivateIps' ? { settingValue: enabled } : null };
  await rejects(service.save('key', { allowedIps: ['192.168.29.142'] }), 'INVALID_ALLOWED_IPS');
  await rejects(service.assertIp('key', '192.168.29.142'), 'API_KEY_IP_NOT_ALLOWED');
  enabled = 'true';
  await service.save('key', { allowedIps: ['192.168.29.142'] });
  await service.assertIp('key', '::ffff:192.168.29.142');
  for (const ip of ['10.1.2.3','172.16.1.1','192.168.1.1','fd00::1']) assert.ok(normalizeIp(ip, true));
  for (const ip of ['127.0.0.1','::1','169.254.1.1','224.0.0.1','192.0.2.1']) assert.equal(normalizeIp(ip, true), null);
  enabled = 'invalid';
  await rejects(service.assertIp('key', '192.168.29.142'), 'API_KEY_IP_NOT_ALLOWED');
});
const check = (policy, oldPrice = 10000n, newPrice = 10500n, rows = []) => fixture(policy, rows).check('key', token, oldPrice, newPrice);
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('IP normalization requires public IPs and treats mapped IPv4 equivalently', async () => {
  for (const ip of ['127.0.0.1','192.168.1.1','10.0.0.1','::1','fc00::1','169.254.1.1','0.0.0.0','2001:db8::1','bad']) assert.equal(normalizeIp(ip), null, ip);
  assert.equal(normalizeIp('::ffff:8.8.8.8'), normalizeIp('8.8.8.8'));
  await fixture().assertIp('key', '::ffff:8.8.8.8');
  await rejects(fixture().assertIp('key', '1.1.1.1'), 'API_KEY_IP_NOT_ALLOWED');
  await rejects(fixture({ allowedIps: [] }).assertIp('key', '8.8.8.8'), 'API_KEY_IP_ALLOWLIST_REQUIRED');
});
test('optional policies may be absent; supplied values have strict formats', async () => {
  assert.ifError(schema.validate(base).error);
  for (const input of [{ threshold: '0' }, { threshold: '100.01' }, { threshold: '1.234' },
    { maxCumulative24hPercent: '-1' }, { cooldownSeconds: '30.5' }, { frequency: 'yearly' },
    { allowedDays: [] }, { allowedDays: ['Mon','Mon'] }, { startTime: '9:00', endTime: '18:00' },
    { startTime: '09:00', endTime: '09:00' }, { startTime: '09:00' }, { timezone: 'invalid' }]) {
    assert.ok(schema.validate({ ...base, ...input }).error, JSON.stringify(input));
  }
  await check({});
});
test('dynamic policy limits enforce cooldown and unique public address counts', async () => {
  const service = fixture();
  service.settingRepository = { findByKey: async key => ({ settingValue: {
    IssuerApiKeyAllowedIpsMin: '2', IssuerApiKeyAllowedIpsMax: '2',
    IssuerApiKeyCooldownMinSeconds: '100', IssuerApiKeyCooldownMaxSeconds: '200',
  }[key] }) };
  await rejects(service.save('key', base), 'INVALID_ALLOWED_IPS');
  await rejects(service.save('key', { allowedIps: ['8.8.8.8','1.1.1.1'], cooldownSeconds: '99' }), 'INVALID_COOLDOWN');
  await rejects(service.save('key', { allowedIps: ['8.8.8.8','::ffff:8.8.8.8'] }), 'INVALID_ALLOWED_IPS');
});
test('threshold is symmetric, inclusive and uses integer price arithmetic', async () => {
  await check({ threshold: '10' }, 100n, 110n);
  await check({ threshold: '10' }, 100n, 90n);
  await rejects(check({ threshold: '10' }, 100n, 111n), 'PRICE_THRESHOLD_EXCEEDED');
  await rejects(check({ threshold: '10' }, 100n, 89n), 'PRICE_THRESHOLD_EXCEEDED');
});
test('schedule checks selected timezone, weekdays and exclusive end time', async () => {
  await check({ allowedDays: ['Thu'], startTime: '11:00', endTime: '13:00' });
  await rejects(check({ allowedDays: ['Mon'] }), 'PRICE_DAY_NOT_ALLOWED');
  await rejects(check({ startTime: '09:00', endTime: '12:00' }), 'PRICE_TIME_NOT_ALLOWED');
  await check({ timezone: 'Asia/Kolkata', startTime: '17:00', endTime: '18:00' });
});
test('overnight windows accept both sides of midnight and keep boundaries and local weekday checks', async () => {
  const policy = { startTime: '18:00', endTime: '09:00', allowedDays: ['Thu'] };
  assert.ifError(schema.validate({ ...base, ...policy }).error);
  for (const time of ['00:00', '08:59', '18:00', '23:59']) {
    const service = fixture(policy);
    service.now = () => new Date(`2026-10-22T${time}:00Z`);
    await service.check('key', token, 100n, 101n);
  }
  for (const time of ['09:00', '12:00', '17:59']) {
    const service = fixture(policy);
    service.now = () => new Date(`2026-10-22T${time}:00Z`);
    await rejects(service.check('key', token, 100n, 101n), 'PRICE_TIME_NOT_ALLOWED');
  }
  const friday = fixture(policy);
  friday.now = () => new Date('2026-10-23T01:00:00Z');
  await rejects(friday.check('key', token, 100n, 101n), 'PRICE_DAY_NOT_ALLOWED');
});
const confirmed = (oldPriceRaw, newPriceRaw, date, submissionMode = 'RELAYED') => ({
  status: 'CONFIRMED', oldPriceRaw, newPriceRaw, confirmedAt: date, submissionMode,
});
test('cooldown and frequency apply across keys for the same token and reject unresolved broadcasts', async () => {
  const rows = [confirmed('10000','10100','2026-10-22T11:59:00Z')];
  await rejects(check({ cooldownSeconds: '300' }, 10100n, 10200n, rows), 'PRICE_COOLDOWN_ACTIVE');
  await rejects(check({ frequency: 'hourly' }, 10100n, 10200n, rows), 'PRICE_FREQUENCY_EXCEEDED');
  await rejects(check({ frequency: 'monthly' }, 10100n, 10200n, rows), 'PRICE_FREQUENCY_EXCEEDED');
  await rejects(check({}, 100n, 101n, [{ status: 'SUBMITTED' }]), 'PRICE_UPDATE_IN_PROGRESS');
});
test('24h movement sums increases and decreases against one baseline including manual updates', async () => {
  const rows = [confirmed('10500','10000','2026-10-22T11:00:00Z', 'DIRECT'),
    confirmed('10000','10500','2026-10-22T10:00:00Z')];
  await check({ maxCumulative24hPercent: '10' }, 10000n, 10000n, rows);
  await rejects(check({ maxCumulative24hPercent: '10' }, 10000n, 10001n, rows), 'PRICE_CUMULATIVE_LIMIT_EXCEEDED');
  await rejects(check({ maxCumulative24hPercent: '10' }, 0n, 1n), 'PRICE_CUMULATIVE_LIMIT_EXCEEDED');
});
test('distributed lock failure and success release their database connection', async () => {
  let released = 0; let unlocked = 0;
  const service = fixture();
  service.pool = () => ({ getConnection: async () => ({
    query: async sql => { if (sql.includes('RELEASE')) unlocked++; return [[{ acquired: 1 }]]; },
    release: () => released++,
  }) });
  const release = await service.acquire('token'); await release();
  assert.equal(released, 1); assert.equal(unlocked, 1);
  service.pool = () => ({ getConnection: async () => ({ query: async () => [[{ acquired: 0 }]], release: () => released++ }) });
  await rejects(service.acquire('token'), 'PRICE_POLICY_BUSY'); assert.equal(released, 2);
});
