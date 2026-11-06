const test = require('node:test');
const assert = require('node:assert/strict');
const { IssuerApiKeyService, PRICE_API_SCOPES } = require('../../src/services/issuer-api-key.service');
const { hashToken } = require('../../src/utils/token');

const USER = {
  userUid: '10000000-0000-4000-8000-000000000001',
  roleUid: '00000000-0000-4000-8000-000000000003',
  roleName: 'Issuer',
  isActive: true,
  roleActive: true,
  emailVerified: true,
};
const ORGANIZATION = {
  organizationUid: '20000000-0000-4000-8000-000000000001',
  userUid: USER.userUid,
  status: 'approved',
};

const fixture = (limit = '5') => {
  const rows = [];
  const audits = [];
  let tail = Promise.resolve();
  const repository = {
    lockOwner: async (uid, connection) => {
      const previous = tail;
      tail = new Promise((resolve) => { connection.release = resolve; });
      await previous;
      connection.locked = true;
    },
    countActive: async (uid) => rows.filter((row) => row.userUid === uid && row.isActive && !row.revokedAt && !row.isDeleted && new Date(row.expiresAt) > new Date()).length,
    create: async (data) => {
      const row = {
        ...data,
        scopes: JSON.stringify(data.scopes),
        isActive: true,
        revokedAt: null,
        lastUsedAt: null,
        lastUsedIp: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return row;
    },
    createAudit: async (data) => audits.push(data),
    listOwned: async (userUid) => rows.filter((row) => row.userUid === userUid && !row.isDeleted),
    findByPublicId: async (publicId) => rows.find((row) => row.publicId === publicId) || null,
    findOwnedByUid: async (uid, userUid, connection) => {
      assert.equal(connection.locked, true, 'owned key read must follow the issuer lock');
      return rows.find((row) => row.issuerApiKeyUid === uid && row.userUid === userUid) || null;
    },
    markUsed: async (uid, ipAddress) => {
      const row = rows.find((item) => item.issuerApiKeyUid === uid);
      row.lastUsedAt = new Date();
      row.lastUsedIp = ipAddress;
    },
    revoke: async (uid) => {
      const row = rows.find((item) => item.issuerApiKeyUid === uid);
      row.isActive = false;
      row.revokedAt = new Date();
      return true;
    },
  };
  const service = new IssuerApiKeyService({
    repository,
    userRepository: { findAuthIdentityByUid: async () => USER },
    organizationRepository: { findByUserUid: async (uid, connection) => {
      if (connection) assert.equal(connection.locked, true, 'organization read must follow the issuer lock');
      return ORGANIZATION;
    } },
    settingRepository: { findByKey: async () => limit === undefined ? null : ({ settingValue: limit }) },
    transactionRunner: async (work) => {
      const connection = {};
      try { return await work(connection); } finally { connection.release?.(); }
    },
  });
  return { service, rows, audits };
};

test('issuer creates a scoped API key whose plaintext is returned once and only its hash is stored', async () => {
  const { service, rows } = fixture();
  const created = await service.create(USER, { name: 'Pricing bot', expiresInDays: 365 });
  assert.match(created.apiKey, /^trex_iss_[a-f0-9]{24}_[a-f0-9]{64}$/);
  assert.deepEqual(created.scopes, PRICE_API_SCOPES);
  assert.equal(rows[0].keyHash, hashToken(created.apiKey));
  assert.equal(JSON.stringify(rows[0]).includes(created.apiKey), false);

  const { keys: listed } = await service.list(USER);
  assert.equal(listed.length, 1);
  assert.equal('apiKey' in listed[0], false);
  assert.match(listed[0].maskedKey, /^trex_iss_[a-f0-9]{8}\.\.\.[a-f0-9]{4}$/);
});

test('API key policy is saved, exposed, copied on rotation and IP checked for every bot scope', async () => {
  const { service } = fixture();
  const policies = new Map(); const attempts = [];
  service.policyService = {
    save: async (uid, policy) => { assert.equal(policy.name, undefined); policies.set(uid, policy); return policy; },
    get: async uid => policies.get(uid),
    assertIp: async (uid, ip) => { attempts.push([uid, ip]); if (ip !== '8.8.8.8') throw new Error('IP denied'); },
  };
  const created = await service.create(USER, { name: 'Pricing bot', allowedIps: ['8.8.8.8'], threshold: '10' });
  assert.equal(created.policy.threshold, '10');
  for (const scope of PRICE_API_SCOPES) {
    await service.authenticate(created.apiKey, scope, { ipAddress: '8.8.8.8' });
    await assert.rejects(service.authenticate(created.apiKey, scope, { ipAddress: '1.1.1.1' }), /IP denied/);
  }
  assert.equal(attempts.length, 6);
  const rotated = await service.rotate(USER, created.issuerApiKeyUid, {});
  assert.equal(rotated.policy.threshold, '10');
  const edited = await service.updatePolicy(USER, rotated.issuerApiKeyUid, { allowedIps: ['1.1.1.1'] });
  assert.deepEqual(edited.policy.allowedIps, ['1.1.1.1']);
  await assert.rejects(service.updatePolicy(USER, 'foreign-key', { allowedIps: ['8.8.8.8'] }), e => e.statusCode === 404);
});

test('key list includes configured capacity and counts only active owned keys', async () => {
  const { service, rows } = fixture('2');
  for (const state of ['expired', 'revoked', 'disabled', 'deleted', 'foreign', 'active']) {
    rows.push({ userUid: state === 'foreign' ? 'other' : USER.userUid,
      isActive: state !== 'disabled', isDeleted: state === 'deleted',
      revokedAt: state === 'revoked' ? new Date() : null,
      expiresAt: state === 'expired' ? new Date(0) : new Date(Date.now() + 60000) });
  }
  assert.deepEqual((await service.list(USER)).meta, { maxActiveKeys: 2, activeKeyCount: 1, remainingSlots: 1 });
  rows.push({ userUid: USER.userUid, isActive: true, expiresAt: new Date(Date.now() + 60000) });
  assert.deepEqual((await service.list(USER)).meta, { maxActiveKeys: 2, activeKeyCount: 2, remainingSlots: 0 });
  rows.push({ userUid: USER.userUid, isActive: true, expiresAt: new Date(Date.now() + 60000) });
  assert.deepEqual((await service.list(USER)).meta, { maxActiveKeys: 2, activeKeyCount: 3, remainingSlots: 0 });
});

test('empty key list uses fallback setting and rejects non-issuer access', async () => {
  const { service } = fixture('invalid');
  const result = await service.list(USER);
  assert.deepEqual(result.keys, []);
  assert.deepEqual(result.meta, { maxActiveKeys: 5, activeKeyCount: 0, remainingSlots: 5 });
  await assert.rejects(service.list({ ...USER, roleName: 'Investor' }), (e) => e.statusCode === 403);
});

test('list controller preserves data array and exposes counts in meta', async () => {
  const { createIssuerApiKeyController } = require('../../src/api/v1/controllers/issuer-api-key.controller');
  const { service } = fixture('2');
  await service.create(USER, { name: 'bot', expiresInDays: 30 });
  let response;
  const res = { status(code) { assert.equal(code, 200); return this; }, json(body) { response = body; return body; } };
  await createIssuerApiKeyController(service).list({ user: USER, id: 'test' }, res);
  assert.ok(Array.isArray(response.data));
  assert.equal(response.data.length, 1);
  assert.equal('apiKey' in response.data[0], false);
  assert.deepEqual(response.meta, { maxActiveKeys: 2, activeKeyCount: 1, remainingSlots: 1 });
});

test('active rotation preserves active count and concurrent rotations have one winner', async () => {
  const { service, rows } = fixture();
  const key = await service.create(USER, { name: 'bot', expiresInDays: 30 });
  const outcomes = await Promise.allSettled([1, 2].map(() => service.rotate(USER, key.issuerApiKeyUid, { expiresInDays: 30 })));
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((r) => r.status === 'rejected').reason.code, 'ISSUER_API_KEY_NOT_ACTIVE');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].revokedAt);
  assert.equal(rows.filter((r) => r.isActive).length, 1);
});

for (const state of ['expired', 'revoked', 'disabled', 'deleted', 'foreign']) {
  test(`rotation rejects ${state} key without inserting`, async () => {
    const { service, rows } = fixture();
    const key = await service.create(USER, { name: 'bot', expiresInDays: 30 });
    if (state === 'expired') rows[0].expiresAt = new Date(0);
    if (state === 'revoked') rows[0].revokedAt = new Date();
    if (state === 'disabled') rows[0].isActive = false;
    if (state === 'deleted') rows[0].isDeleted = true;
    if (state === 'foreign') rows[0].userUid = 'another-issuer';
    await assert.rejects(service.rotate(USER, key.issuerApiKeyUid, { expiresInDays: 30 }),
      (e) => e.statusCode === 409 && e.code === 'ISSUER_API_KEY_NOT_ACTIVE');
    assert.equal(rows.length, 1);
  });
}

test('DB limit of two rejects third create and concurrent create/rotate stays at limit', async () => {
  const { service, rows } = fixture('2');
  const key = await service.create(USER, { name: 'one', expiresInDays: 30 });
  await service.create(USER, { name: 'two', expiresInDays: 30 });
  const results = await Promise.allSettled([
    service.create(USER, { name: 'three', expiresInDays: 30 }),
    service.rotate(USER, key.issuerApiKeyUid, { expiresInDays: 30 }),
  ]);
  assert.equal(results[0].reason.code, 'ISSUER_API_KEY_LIMIT_REACHED');
  assert.equal(results[0].reason.statusCode, 409);
  assert.match(results[0].reason.message, /2/);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(rows.filter((r) => r.isActive).length, 2);
});

test('valid API key authenticates only an allowed price scope and records use', async () => {
  const { service, rows, audits } = fixture();
  const created = await service.create(USER, { name: 'Pricing bot', expiresInDays: 30 });
  const result = await service.authenticate(created.apiKey, 'TOKEN_PRICE_SUBMIT', {
    ipAddress: '127.0.0.1', requestId: 'request-1', apiPath: '/api/v1/tokens/me/price-updates',
  });
  assert.equal(result.user.userUid, USER.userUid);
  assert.equal(rows[0].lastUsedIp, '127.0.0.1');
  assert.equal(audits.at(-1).action, 'AUTHENTICATED');

  await assert.rejects(
    service.authenticate(created.apiKey, 'TOKEN_DEPLOY', {}),
    (error) => error.code === 'ISSUER_API_KEY_SCOPE_REQUIRED' && error.statusCode === 403,
  );
});

test('revoked issuer API key is immediately rejected and rotation returns a different one-time key', async () => {
  const { service } = fixture();
  const created = await service.create(USER, { name: 'Pricing bot', expiresInDays: 30 });
  const rotated = await service.rotate(USER, created.issuerApiKeyUid, { name: 'Pricing bot v2', expiresInDays: 60 });
  assert.notEqual(rotated.apiKey, created.apiKey);
  await assert.rejects(
    service.authenticate(created.apiKey, 'TOKEN_PRICE_READ', {}),
    (error) => error.code === 'ISSUER_API_KEY_REVOKED' && error.statusCode === 401,
  );
  const authenticated = await service.authenticate(rotated.apiKey, 'TOKEN_PRICE_READ', {});
  assert.equal(authenticated.user.userUid, USER.userUid);
});
