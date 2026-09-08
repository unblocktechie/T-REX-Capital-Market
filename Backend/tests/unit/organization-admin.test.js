const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../../src/schemas/organization.schema');
const { OrganizationAdminService } = require('../../src/services/organization-admin.service');
const { OrganizationService } = require('../../src/services/organization.service');

const immediateTransaction = (callback) => callback({ transaction: true });
const successfulIdentityService = {
  createOrganizationIdentity: async () => ({
    identityAddress: '0x2222222222222222222222222222222222222222',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    alreadyExisted: false,
  }),
};

test('admin rejection requires a meaningful rejection reason', () => {
  assert.ok(schemas.reviewOrganization.validate({ status: 'rejected' }).error);
  assert.ok(schemas.reviewOrganization.validate({ status: 'rejected', rejectionReason: 'Too short' }).error);
  assert.equal(schemas.reviewOrganization.validate({
    status: 'rejected',
    rejectionReason: 'Please replace the expired incorporation document.',
  }).error, undefined);
  assert.equal(schemas.reviewOrganization.validate({ status: 'approved' }).error, undefined);
});

test('admin document endpoint supports inline preview and attachment download', () => {
  const preview = schemas.adminDocumentFileQuery.validate({});
  assert.equal(preview.error, undefined);
  assert.equal(preview.value.disposition, 'inline');
  assert.equal(schemas.adminDocumentFileQuery.validate({ disposition: 'attachment' }).error, undefined);
  assert.ok(schemas.adminDocumentFileQuery.validate({ disposition: 'public' }).error);
});

test('admin document access rejects storage paths outside the upload directory', async () => {
  const service = new OrganizationAdminService({
    findByOrganizationUid: async () => ({
      organizationUid: 'organization-1',
      status: 'submitted',
      submittedAt: new Date(),
    }),
    findDocument: async () => ({
      documentUid: 'document-1',
      storageKey: '../outside.pdf',
      originalFileName: 'outside.pdf',
      mimeType: 'application/pdf',
    }),
  }, successfulIdentityService, immediateTransaction);

  await assert.rejects(
    service.getDocumentFile('organization-1', 'document-1'),
    (error) => error.statusCode === 404,
  );
});

test('first rejection grants exactly one resubmission opportunity', async () => {
  let update;
  const service = new OrganizationAdminService({
    findForReview: async () => ({ status: 'submitted', rejectionCount: 0 }),
    updateByOrganizationUid: async (organizationUid, fields) => {
      update = { organizationUid, fields };
      return fields;
    },
  }, successfulIdentityService, immediateTransaction);

  await service.reviewApplication('organization-1', {
    status: 'rejected',
    rejectionReason: 'Please update the submitted company registration details.',
  });

  assert.equal(update.fields.status, 'rejected');
  assert.equal(update.fields.rejectionCount, 1);
  assert.equal(update.fields.canResubmit, true);
  assert.equal(update.fields.currentStep, 'companyInformation');

  const issuerService = new OrganizationService({});
  assert.doesNotThrow(() => issuerService.assertEditable({ status: 'rejected', canResubmit: true }));
  assert.deepEqual(
    issuerService.draftState({ status: 'rejected', canResubmit: true, submittedAt: '2026-07-28T00:00:00.000Z' }),
    {
      status: 'rejected',
      isDraft: true,
      submittedAt: '2026-07-28T00:00:00.000Z',
    },
  );
});

test('second rejection permanently disables editing and resubmission', async () => {
  let fields;
  const adminService = new OrganizationAdminService({
    findForReview: async () => ({ status: 'resubmitted', rejectionCount: 1 }),
    updateByOrganizationUid: async (organizationUid, input) => {
      fields = input;
      return input;
    },
  }, successfulIdentityService, immediateTransaction);

  await adminService.reviewApplication('organization-1', {
    status: 'rejected',
    rejectionReason: 'The revised application still does not meet compliance requirements.',
  });

  assert.equal(fields.rejectionCount, 2);
  assert.equal(fields.canResubmit, false);
  assert.equal(fields.currentStep, 'completed');

  const issuerService = new OrganizationService({});
  assert.throws(
    () => issuerService.assertEditable({ status: 'rejected', canResubmit: false }),
    /contact Sales/i,
  );
});

test('approved application clears rejection data and remains read-only', async () => {
  let fields;
  const service = new OrganizationAdminService({
    findForReview: async () => ({
      organizationUid: 'organization-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      status: 'submitted',
      rejectionCount: 1,
    }),
    updateByOrganizationUid: async (organizationUid, input) => {
      fields = input;
      return input;
    },
  }, successfulIdentityService, immediateTransaction);

  await service.reviewApplication('organization-1', { status: 'approved' });
  assert.equal(fields.status, 'approved');
  assert.equal(fields.rejectionReason, null);
  assert.equal(fields.canResubmit, false);
  assert.equal(fields.contractAddress, '0x2222222222222222222222222222222222222222');
  assert.equal(fields.contractTxnHash, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.match(fields.contractTxnMessage, /created/i);
});

test('failed identity creation is recorded without approving the application', async () => {
  const updates = [];
  const failure = new Error('execution reverted');
  failure.transactionHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const service = new OrganizationAdminService({
    findForReview: async () => ({
      organizationUid: 'organization-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      status: 'submitted',
    }),
    updateByOrganizationUid: async (organizationUid, fields) => {
      updates.push(fields);
      return { organizationUid, status: 'submitted', ...fields };
    },
  }, {
    createOrganizationIdentity: async () => { throw failure; },
  }, immediateTransaction);

  await assert.rejects(
    service.reviewApplication('organization-1', { status: 'approved' }),
    (error) => error.statusCode === 502
      && error.code === 'ORGANIZATION_IDENTITY_CREATION_FAILED'
      && /execution reverted/.test(error.message),
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, undefined);
  assert.equal(updates[0].contractTxnHash, failure.transactionHash);
  assert.match(updates[0].contractTxnMessage, /failed/i);
});

test('organization uses resubmitted status after its first rejection', () => {
  const service = new OrganizationService({});
  assert.equal(service.submissionStatus({ rejectionCount: 0 }), 'submitted');
  assert.equal(service.submissionStatus({ rejectionCount: 1 }), 'resubmitted');
  assert.throws(
    () => service.assertEditable({ status: 'resubmitted' }),
    /cannot be edited/i,
  );
});
