const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { InvestmentService } = require('../../src/services/investment.service');
const { AdminPlatformService } = require('../../src/services/admin-platform.service');
const schemas = require('../../src/schemas/admin-platform.schema');

test('submission lookup scopes document to the requested application', async () => {
  const service = Object.create(InvestmentService.prototype);
  service.investorUploadsDir = __dirname;
  service.repository = { findSubmissionDocument: async (interest, doc) => {
    assert.equal(interest, 'application'); assert.equal(doc, 'document'); return null;
  } };
  await assert.rejects(service.getSubmissionDocumentFile('application', 'document'), e => e.statusCode === 404);
});
test('valid submission file resolves, but traversal and missing files are rejected', async () => {
  const service = Object.create(InvestmentService.prototype);
  service.investorUploadsDir = __dirname;
  let storageKey = path.basename(__filename);
  service.repository = { findSubmissionDocument: async () => ({ storageKey }) };
  assert.equal((await service.getSubmissionDocumentFile('i', 'd')).filePath, fs.realpathSync(__filename));
  for (const invalid of ['../../package.json', 'missing-document-file', null, '.']) {
    storageKey = invalid;
    await assert.rejects(service.getSubmissionDocumentFile('i', 'd'), e => e.statusCode === 404);
  }
});
test('admin document checks application exists before accessing file', async () => {
  let called = false;
  const service = new AdminPlatformService({ getInvestmentService: () => ({
    repository: { findInterestByUid: async () => null },
    getSubmissionDocumentFile: async () => { called = true; },
  }) });
  await assert.rejects(service.applicationDocument('i', 'd'), e => e.statusCode === 404);
  assert.equal(called, false);
  assert.ok(schemas.documentParams.validate({ interestUid: 'bad', documentUid: 'bad' }).error);
});
