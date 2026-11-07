const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
const { createAdminPlatformRouter } = require('../../src/api/v1/routes/admin-platform.routes');
const { errorHandler } = require('../../src/core/errors/error-handler');
const { ApiError } = require('../../src/core/errors/api-error');
const { VerificationTeamNotificationService } = require('../../src/services/verification-team-notification.service');
const { verifiedAccountTeamEmail } = require('../../src/services/common/email-template.service');

test('admin key settings validate, update DB values, and retain unchanged values', async () => {
  const values = new Map([['IssuerApiKeyMaxActive', '5']]);
  const service = new AdminPlatformService({ settingRepository: {
    findByKey: async (key) => values.has(key) ? { settingValue: values.get(key), isActive: true } : null,
    setValueByKey: async (key, value, connection) => { assert.equal(connection.tx, true); values.set(key, String(value)); return true; },
  }, transactionRunner: (work) => work({ tx: true }) });
  const result = await service.updateKeySettings({ IssuerApiKeyMaxActive: 2 });
  assert.equal(result.IssuerApiKeyMaxActive, 2);
  assert.equal(result.TokenPriceRelayRateLimitCount, 10);
  await assert.rejects(service.updateKeySettings({ IssuerApiKeyMaxActive: 0 }));
  await assert.rejects(service.updateKeySettings({ TokenPriceRelaySignatureTtlSeconds: 5 }));
  await assert.rejects(service.updateKeySettings({ unrelatedSecret: 123 }));
  await assert.rejects(service.updateNotifications({ teamNotificationEmails: ['invalid'] }));
});

test('admin routes require authentication and permission; list response is paginated', async () => {
  const app = express(); app.use(express.json());
  app.use('/api/v1/admin', createAdminPlatformRouter({
    authenticate: (req, res, next) => req.get('Authorization') ? next() : next(ApiError.unauthorized('Login required')),
    authorize: (req, res, next) => req.get('Authorization') === 'Bearer admin' ? next() : next(ApiError.forbidden('Admin required')),
    service: { list: async (kind, q) => { assert.equal(kind, 'investors'); assert.equal(q.limit, 5); return { rows: [], pagination: { total: 0 } }; } },
  }));
  app.use(errorHandler);
  await request(app).get('/api/v1/admin/investors').expect(401);
  await request(app).get('/api/v1/admin/investors').set('Authorization', 'Bearer issuer').expect(403);
  const result = await request(app).get('/api/v1/admin/investors?limit=5').set('Authorization', 'Bearer admin').expect(200);
  assert.deepEqual(result.body.data, []);
  assert.equal(result.body.meta.pagination.total, 0);
  await request(app).get('/api/v1/admin/investors?limit=1000').set('Authorization', 'Bearer admin').expect(422);
});

test('application view preserves status and exposes issuer review stage', async () => {
  const service = new AdminPlatformService({ repository: { applications: async () => ({ rows: [{ status: 'submitIntrest' }, { status: 'registered' }] }) } });
  const { rows } = await service.list('applications', { pendingOnly: true });
  assert.equal(rows[0].awaitingIssuerReview, true);
  assert.equal(rows[0].stage, 'Awaiting issuer review');
  assert.equal(rows[1].awaitingIssuerReview, false);
});

test('verification notification is queued only for supported roles and contains no credentials', async () => {
  const calls = [];
  const service = new VerificationTeamNotificationService({ query: async (...args) => calls.push(args) });
  await service.enqueue({ userUid: 'u', fullName: 'Test', email: 'test@example.com', roleName: 'Investor', accessToken: 'SECRET' }, 'tx');
  await service.enqueue({ roleName: 'Super Administrator' }, 'tx');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], 'tx');
  assert.match(calls[0][0], /ON DUPLICATE KEY/);
  assert.equal(JSON.stringify(calls).includes('SECRET'), false);
  const mail = verifiedAccountTeamEmail({ fullName: '<script>', email: 'test@example.com', roleName: 'Issuer' });
  assert.ok(mail.html.includes('&lt;script&gt;'));
  assert.equal(mail.html.includes('<script>'), false);
});

test('notification worker sends configured recipients and records SMTP failure for retry', async () => {
  for (const failed of [false, true]) {
    const updates = [];
    const service = new VerificationTeamNotificationService({
      settingRepository: { findByKey: async () => ({ isActive: true, settingValue: '["team@example.com"]' }) },
      query: async (sql) => { updates.push(sql); return sql.startsWith('SELECT') ? [{ notificationUid: 'n', fullName: 'Test', email: 'test@example.com', roleName: 'Issuer' }] : { affectedRows: 1 }; },
      emailService: { sendEmail: async (mail) => { assert.deepEqual(mail.to, ['team@example.com']); if (failed) throw new Error('SMTP unavailable'); } },
    });
    await service.run();
    assert.ok(updates.some(sql => sql.includes(failed ? "status='PENDING'" : "status='SENT'")));
  }
});

test('empty team list pauses delivery and a lost lease never sends mail', async () => {
  let sent = false;
  const service = new VerificationTeamNotificationService({
    settingRepository: { findByKey: async () => ({ isActive: true, settingValue: '[]' }) },
    query: async () => assert.fail('paused queue should not query'), emailService: { sendEmail: async () => { sent = true; } },
  });
  await service.run();
  service.settingRepository.findByKey = async () => ({ isActive: true, settingValue: '["team@example.com"]' });
  service.query = async (sql) => sql.startsWith('SELECT') ? [{ notificationUid: 'n' }] : { affectedRows: 0 };
  await service.run(); assert.equal(sent, false);
});
