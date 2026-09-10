const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../../src/schemas/investment.schema');
const { InvestmentService } = require('../../src/services/investment.service');

const investor = { userUid: 'user-inv', roleName: 'Investor' };
const issuer = { userUid: 'user-iss', roleName: 'Issuer' };
const admin = { userUid: 'user-adm', roleName: 'Super Admin' };

const restriction = { tokenUid: 'tok-1', countryUid: 'c-in', countryCode: 'IN', countryName: 'India', numericCode: '356' };

const KYC = { claimTopicUid: 'ct-kyc', claimTopicCode: 'KYC', claimTopicName: 'KYC', value: 1 };
const ACC = { claimTopicUid: 'ct-acc', claimTopicCode: 'ACCREDITED_INVESTOR', claimTopicName: 'Accredited Investor', value: 2 };

const deployedToken = {
  tokenUid: 'tok-1', organizationUid: 'org-1', tokenName: 'Acme', tokenSymbol: 'ACM',
  decimals: 18, initialTokenPrice: '1.50', imageStorageKey: 'img.webp', imageMimeType: 'image/webp',
  treasuryWalletAddress: `0x${'9'.repeat(40)}`,
  maxInvestors: 100, maxHolder: 100, maxBalancePerInvestor: '5000', countryRestrictionMode: 'allow',
  organizationCountryName: 'United States', organizationCountryCode: 'US',
  status: 'deployed',
};

const kycDoc = {
  documentUid: 'doc-kyc', documentTypeUid: 'dt-kyc', documentTypeName: 'Passport',
  documentCategory: 'kyc', claimTopicCode: 'KYC', originalFileName: 'passport.pdf',
  mimeType: 'application/pdf', fileSize: 1000, storageKey: 'doc-kyc.pdf', createdAt: '2020-01-01T00:00:00Z',
};
const accDoc = {
  documentUid: 'doc-acc', documentTypeUid: 'dt-acc', documentTypeName: 'Net Worth',
  documentCategory: 'accredited', claimTopicCode: 'ACCREDITED_INVESTOR', originalFileName: 'nw.pdf',
  mimeType: 'application/pdf', fileSize: 2000, storageKey: 'doc-acc.pdf', createdAt: '2020-01-01T00:00:00Z',
};

const submittedInvestor = { investorUid: 'inv-1', userUid: 'user-inv', status: 'submitted', walletAddress: `0x${'1'.repeat(40)}` };

const makeService = (over = {}) => {
  const state = {
    created: null,
    updated: null,
    token: over.token === undefined ? deployedToken : over.token,
    requiredTopics: over.requiredTopics || [KYC],
    investorRecord: over.investorRecord === undefined ? submittedInvestor : over.investorRecord,
    documents: over.documents || [kycDoc],
    existingInterest: over.existingInterest || null,
    organization: over.organization === undefined ? { organizationUid: 'org-1' } : over.organization,
    interest: over.interest || null,
    activeInterests: over.activeInterests || [],
    restrictions: over.restrictions || [restriction],
    history: over.history ? [...over.history] : [],
    submissionDocs: over.submissionDocs ? [...over.submissionDocs] : [],
    signedVerification: over.signedVerification || null,
    listArgs: null,
  };
  const service = new InvestmentService({
    repository: {
      listMarketplaceTokens: async (opts) => { state.listArgs = opts; return { rows: [deployedToken], total: 1 }; },
      listCountryRestrictionsForTokens: async () => state.restrictions,
      findMarketplaceTokenByUid: async () => state.token,
      findTokenImageByUid: async () => (state.token ? { ...state.token } : null),
      findActiveInterest: async () => state.existingInterest,
      createInterest: async (data) => { state.created = { interestUid: 'int-new', ...data }; return state.created; },
      updateInterestByUid: async (interestUid, data) => {
        state.updated = { interestUid, ...data };
        return { ...(state.interest || state.existingInterest || {}), interestUid, ...data };
      },
      findInterestByUid: async () => state.interest,
      listActiveInterestsByInvestor: async () => state.activeInterests,
      createHistory: async (data) => { const historyUid = `h${state.history.length + 1}`; state.history.push({ historyUid, createdAt: `2020-01-0${state.history.length + 1}`, ...data }); return historyUid; },
      listHistoryByInterest: async (interestUid) => state.history.filter((h) => h.interestUid === interestUid),
      getMaxSubmissionNumber: async (interestUid) => state.submissionDocs.filter((d) => d.interestUid === interestUid).reduce((m, d) => Math.max(m, d.submissionNumber), 0),
      createSubmissionDocument: async (data) => { const uid = `sd${state.submissionDocs.length + 1}`; state.submissionDocs.push({ submissionDocumentUid: uid, ...data }); return uid; },
      listSubmissionDocumentsByInterest: async (interestUid) => state.submissionDocs.filter((d) => d.interestUid === interestUid),
      findSubmissionDocument: async (interestUid, documentUid) => state.submissionDocs
        .filter((d) => d.interestUid === interestUid && d.documentUid === documentUid)
        .sort((a, b) => b.submissionNumber - a.submissionNumber)[0] || null,
      listInterestsByInvestor: async () => [{ interestUid: 'int-1', tokenUid: 'tok-1', status: 'submitIntrest', maxInvestors: 100, maxBalancePerInvestor: '5000' }],
      listInterestsByOrganization: async () => [{ interestUid: 'int-1', status: 'submitIntrest' }],
    },
    tokenRepository: { listClaimTopics: async () => state.requiredTopics },
    investorRepository: {
      findByUserUid: async () => state.investorRecord,
      listDocuments: async () => state.documents,
      listCurrentDocumentsForSnapshot: async () => state.documents.map((d) => ({
        documentUid: d.documentUid, documentTypeUid: d.documentTypeUid, documentTypeName: d.documentTypeName,
        documentCategory: d.documentCategory, claimTopicCode: d.claimTopicCode, versionNumber: d.versionNumber || 1,
        originalFileName: d.originalFileName, storageKey: d.storageKey, mimeType: d.mimeType, fileSize: d.fileSize,
      })),
      findDocument: async (investorUid, documentUid) => state.documents.find((d) => d.documentUid === documentUid) || null,
    },
    organizationRepository: { findByUserUid: async () => state.organization },
    tokenImageService: { resolve: (key) => `/tmp/${key}` },
    issuerClaimRepository: { findLatestVerificationByStatus: async () => state.signedVerification },
    investorUploadsDir: '/tmp',
  });
  return { service, state };
};

// ----------------------------------------------------------------- schema

test('listTokensQuery applies defaults and rejects an unknown status', () => {
  const ok = schemas.listTokensQuery.validate({});
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.status, 'deployed');
  assert.ok(schemas.listTokensQuery.validate({ status: 'nonsense' }).error);
});

test('issuerInterestsQuery defaults to submitIntrest', () => {
  assert.equal(schemas.issuerInterestsQuery.validate({}).value.status, 'submitIntrest');
});

test('rejectInterest schema requires claim codes for DOC_REJECTED and forbids them for OTHER', () => {
  assert.equal(schemas.rejectInterest.validate({ rejectReasonType: 'DOC_REJECTED', rejectReason: 'bad', rejectedClaims: ['KYC'] }).error, undefined);
  assert.ok(schemas.rejectInterest.validate({ rejectReasonType: 'DOC_REJECTED', rejectReason: 'bad' }).error); // missing claims
  assert.ok(schemas.rejectInterest.validate({ rejectReasonType: 'DOC_REJECTED', rejectReason: 'bad', rejectedClaims: [] }).error); // empty claims
  assert.equal(schemas.rejectInterest.validate({ rejectReasonType: 'OTHER', rejectReason: 'nope' }).error, undefined);
  assert.ok(schemas.rejectInterest.validate({ rejectReasonType: 'OTHER', rejectReason: 'nope', rejectedClaims: ['KYC'] }).error); // claims not allowed
  assert.ok(schemas.rejectInterest.validate({ rejectReasonType: 'DOC_REJECTED' }).error); // missing reason
});

// ------------------------------------------------------------- marketplace

test('listTokens returns items, caps, country restrictions, org country, and pagination', async () => {
  const { service } = makeService();
  const result = await service.listTokens(admin, { page: 1, limit: 20 });
  const [item] = result.items;
  assert.equal(item.imageUrl, '/api/v1/investments/tokens/tok-1/image');
  assert.equal(item.imageStorageKey, undefined);
  assert.equal(item.maxInvestors, 100);
  assert.equal(item.maxHolder, 100);
  assert.equal(item.maxBalancePerInvestor, '5000');
  assert.equal(item.organizationCountryName, 'United States');
  assert.equal(item.organizationCountryCode, 'US');
  assert.deepEqual(item.countryRestrictions, [{ countryUid: 'c-in', countryCode: 'IN', countryName: 'India', numericCode: '356' }]);
  assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
});

test('an admin may filter by any status; an investor is forced to deployed', async () => {
  const a = makeService();
  await a.service.listTokens(admin, { status: 'draft' });
  assert.equal(a.state.listArgs.status, 'draft');
  const i = makeService();
  await i.service.listTokens(investor, { status: 'draft' });
  assert.equal(i.state.listArgs.status, 'deployed');
});

test('token details include the treasury wallet address', async () => {
  const { service } = makeService();
  const result = await service.getTokenDetails('tok-1');
  assert.equal(result.treasuryWalletAddress, deployedToken.treasuryWalletAddress);
});

test('my-interests returns token cap fields', async () => {
  const { service } = makeService();
  const interests = await service.listMyInterests(investor, {});
  assert.equal(interests[0].maxInvestors, 100);
  assert.equal(interests[0].maxBalancePerInvestor, '5000');
});

// -------------------------------------------------------- submit interest

test('submit interest creates submitIntrest when all required documents are present', async () => {
  const { service, state } = makeService({ requiredTopics: [KYC], documents: [kycDoc] });
  const created = await service.submitInterest(investor, 'tok-1', { note: 'keen' });
  assert.equal(created.status, 'submitIntrest');
  assert.equal(state.created.tokenUid, 'tok-1');
  assert.equal(state.created.investorUid, 'inv-1');
});

test('submit interest creates a pending record when a required document is missing', async () => {
  const { service, state } = makeService({ requiredTopics: [KYC, ACC], documents: [kycDoc] });
  const created = await service.submitInterest(investor, 'tok-1', {});
  assert.equal(created.status, 'pending');
  assert.equal(state.created.status, 'pending');
});

test('submit interest with no required claim topics is submitIntrest', async () => {
  const { service } = makeService({ requiredTopics: [], documents: [] });
  const created = await service.submitInterest(investor, 'tok-1', {});
  assert.equal(created.status, 'submitIntrest');
});

test('submit interest promotes an existing pending record once documents are complete', async () => {
  const { service, state } = makeService({
    requiredTopics: [KYC], documents: [kycDoc],
    existingInterest: { interestUid: 'int-1', status: 'pending' },
  });
  const result = await service.submitInterest(investor, 'tok-1', {});
  assert.equal(state.updated.status, 'submitIntrest');
  assert.equal(result.status, 'submitIntrest');
});

test('submit interest conflicts when the interest was already approved or rejected', async () => {
  const approved = makeService({ existingInterest: { interestUid: 'int-1', status: 'approved' } });
  await assert.rejects(approved.service.submitInterest(investor, 'tok-1', {}), (e) => e.statusCode === 409);
  const rejected = makeService({ existingInterest: { interestUid: 'int-1', status: 'rejected' } });
  await assert.rejects(rejected.service.submitInterest(investor, 'tok-1', {}), (e) => e.statusCode === 409);
});

test('submit interest requires a submitted investor and a deployed token', async () => {
  const draft = makeService({ investorRecord: { investorUid: 'inv-1', status: 'draft', walletAddress: `0x${'1'.repeat(40)}` } });
  await assert.rejects(draft.service.submitInterest(investor, 'tok-1', {}), (e) => e.statusCode === 409);
  const notDeployed = makeService({ token: { ...deployedToken, status: 'draft' } });
  await assert.rejects(notDeployed.service.submitInterest(investor, 'tok-1', {}), (e) => e.statusCode === 409);
});

// ------------------------------------------------- required-documents (#6)

test('required-documents flags each topic missing/rejected and returns rejection info', async () => {
  const rejectedInterest = {
    interestUid: 'int-1', status: 'rejected', rejectReasonType: 'DOC_REJECTED',
    rejectReason: 'Passport blurry', rejectedClaim: 'ACCREDITED_INVESTOR', rejectedCount: 3, canResubmitClaim: 0,
  };
  const { service } = makeService({ requiredTopics: [KYC, ACC], documents: [kycDoc], existingInterest: rejectedInterest });
  const result = await service.getRequiredDocuments(investor, 'tok-1');

  const kyc = result.requiredClaimTopics.find((t) => t.claimTopicCode === 'KYC');
  const acc = result.requiredClaimTopics.find((t) => t.claimTopicCode === 'ACCREDITED_INVESTOR');
  assert.equal(kyc.missing, false);
  assert.equal(kyc.rejected, false);
  assert.equal(acc.missing, true);
  assert.equal(acc.rejected, true);
  assert.equal(result.interestStatus, 'rejected');
  assert.equal(result.rejection.rejectReason, 'Passport blurry');
  assert.deepEqual(result.rejection.rejectedClaim, ['ACCREDITED_INVESTOR']);
  assert.equal(result.rejection.resubmitRemaining, 3);
  assert.equal(result.rejection.canResubmit, true);
});

test('required-documents has no rejection block when there is no rejected interest', async () => {
  const { service } = makeService({ requiredTopics: [KYC], documents: [kycDoc] });
  const result = await service.getRequiredDocuments(investor, 'tok-1');
  assert.equal(result.eligible, true);
  assert.equal(result.rejection, null);
});

// ------------------------------------------------- upload gate + sync (#2/#5)

test('assertClaimUploadAllowed permits a pending interest and blocks when none qualify', async () => {
  const pending = makeService({ activeInterests: [{ status: 'pending' }] });
  await pending.service.assertClaimUploadAllowed('inv-1'); // resolves
  const resubmit = makeService({ activeInterests: [{ status: 'rejected', rejectReasonType: 'DOC_REJECTED', canResubmitClaim: 1, rejectedCount: 3 }] });
  await resubmit.service.assertClaimUploadAllowed('inv-1'); // resolves
  const none = makeService({ activeInterests: [{ status: 'approved' }] });
  await assert.rejects(none.service.assertClaimUploadAllowed('inv-1'), (e) => e.statusCode === 403);
  const capped = makeService({ activeInterests: [{ status: 'rejected', rejectReasonType: 'DOC_REJECTED', canResubmitClaim: 3, rejectedCount: 3 }] });
  await assert.rejects(capped.service.assertClaimUploadAllowed('inv-1'), (e) => e.statusCode === 403);
});

test('sync promotes a pending interest to submitIntrest once documents are complete', async () => {
  const { service, state } = makeService({
    requiredTopics: [KYC], documents: [kycDoc],
    activeInterests: [{ interestUid: 'int-1', tokenUid: 'tok-1', status: 'pending' }],
  });
  await service.syncInterestsForInvestor('inv-1');
  assert.equal(state.updated.status, 'submitIntrest');
});

test('sync does not promote a pending interest while documents are incomplete', async () => {
  const { service, state } = makeService({
    requiredTopics: [KYC, ACC], documents: [kycDoc],
    activeInterests: [{ interestUid: 'int-1', tokenUid: 'tok-1', status: 'pending' }],
  });
  await service.syncInterestsForInvestor('inv-1');
  assert.equal(state.updated, null);
});

test('sync resolves a DOC_REJECTED interest when the rejected claim is re-uploaded, incrementing canResubmitClaim', async () => {
  const freshAcc = { ...accDoc, createdAt: '2020-06-01T00:00:00Z' };
  const { service, state } = makeService({
    requiredTopics: [KYC, ACC], documents: [kycDoc, freshAcc],
    activeInterests: [{
      interestUid: 'int-1', tokenUid: 'tok-1', status: 'rejected', rejectReasonType: 'DOC_REJECTED',
      rejectedClaim: 'ACCREDITED_INVESTOR', rejectedCount: 3, canResubmitClaim: 0,
      decisionAt: '2020-03-01T00:00:00Z',
    }],
  });
  await service.syncInterestsForInvestor('inv-1');
  assert.equal(state.updated.status, 'submitIntrest');
  assert.equal(state.updated.canResubmitClaim, 1);
  assert.equal(state.updated.rejectedClaim, null);
});

test('sync leaves a DOC_REJECTED interest untouched when the document predates the rejection', async () => {
  const { service, state } = makeService({
    requiredTopics: [KYC, ACC], documents: [kycDoc, accDoc], // accDoc createdAt 2020-01-01 (before decision)
    activeInterests: [{
      interestUid: 'int-1', tokenUid: 'tok-1', status: 'rejected', rejectReasonType: 'DOC_REJECTED',
      rejectedClaim: 'ACCREDITED_INVESTOR', rejectedCount: 3, canResubmitClaim: 0,
      decisionAt: '2020-03-01T00:00:00Z',
    }],
  });
  await service.syncInterestsForInvestor('inv-1');
  assert.equal(state.updated, null);
});

// --------------------------------------------------------- issuer decisions

test('approve moves a submitted interest to verifiedByIssuer only when claims are SIGNED', async () => {
  const { service, state } = makeService({
    interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', status: 'submitIntrest' },
    signedVerification: { verificationUid: 'v1', status: 'SIGNED' },
  });
  const result = await service.approveInterest(issuer, 'int-1');
  assert.equal(state.updated.status, 'verifiedByIssuer');
  assert.equal(result.status, 'verifiedByIssuer');
});

test('approve is rejected when there is no SIGNED issuer claim verification', async () => {
  const { service } = makeService({ interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', status: 'submitIntrest' } });
  await assert.rejects(
    service.approveInterest(issuer, 'int-1'),
    (e) => e.statusCode === 409 && e.code === 'ISSUER_CLAIMS_NOT_VERIFIED',
  );
});

test('approve/reject only apply to submitIntrest interests', async () => {
  const { service } = makeService({ interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', status: 'pending' } });
  await assert.rejects(service.approveInterest(issuer, 'int-1'), (e) => e.statusCode === 409);
});

test('reject with DOC_REJECTED stores the rejected claim codes comma-separated', async () => {
  const { service, state } = makeService({
    interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', status: 'submitIntrest' },
    requiredTopics: [KYC, ACC],
  });
  const result = await service.rejectInterest(issuer, 'int-1', { rejectReasonType: 'DOC_REJECTED', rejectReason: 'blurry', rejectedClaims: ['KYC', 'ACCREDITED_INVESTOR'] });
  assert.equal(state.updated.status, 'rejected');
  assert.equal(state.updated.rejectedClaim, 'KYC,ACCREDITED_INVESTOR');
  assert.equal(state.updated.rejectReason, 'blurry');
  assert.equal(result.status, 'rejected');
});

test('reject with DOC_REJECTED rejects claim codes not required by the token', async () => {
  const { service } = makeService({
    interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', status: 'submitIntrest' },
    requiredTopics: [KYC],
  });
  await assert.rejects(
    service.rejectInterest(issuer, 'int-1', { rejectReasonType: 'DOC_REJECTED', rejectReason: 'x', rejectedClaims: ['ACCREDITED_INVESTOR'] }),
    (e) => e.statusCode === 400,
  );
});

test('reject with OTHER stores no rejected claim', async () => {
  const { service, state } = makeService({ interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', status: 'submitIntrest' } });
  await service.rejectInterest(issuer, 'int-1', { rejectReasonType: 'OTHER', rejectReason: 'not interested' });
  assert.equal(state.updated.status, 'rejected');
  assert.equal(state.updated.rejectedClaim, null);
});

test('reject asserts issuer ownership of the interest', async () => {
  const { service } = makeService({ interest: { interestUid: 'int-1', organizationUid: 'org-OTHER', tokenUid: 'tok-1', status: 'submitIntrest' } });
  await assert.rejects(service.rejectInterest(issuer, 'int-1', { rejectReasonType: 'OTHER', rejectReason: 'x' }), (e) => e.statusCode === 404);
});

// ------------------------------------------------------------- history (timeline)

test('submitting interest records a submitted history event', async () => {
  const { service, state } = makeService({ requiredTopics: [KYC], documents: [kycDoc] });
  await service.submitInterest(investor, 'tok-1', {});
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].eventType, 'submitted');
  assert.equal(state.history[0].actorRole, 'investor');
});

test('rejection records a rejected history event with reason and rejected claims', async () => {
  const { service, state } = makeService({
    interest: { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', investorUid: 'inv-1', status: 'submitIntrest' },
    requiredTopics: [KYC, ACC],
  });
  await service.rejectInterest(issuer, 'int-1', { rejectReasonType: 'DOC_REJECTED', rejectReason: 'blurry', rejectedClaims: ['KYC'] });
  const event = state.history.find((h) => h.eventType === 'rejected');
  assert.ok(event);
  assert.equal(event.rejectReason, 'blurry');
  assert.equal(event.rejectedClaim, 'KYC');
  assert.equal(event.actorRole, 'issuer');
});

test('a valid resubmission records a resubmitted event with the attempt number', async () => {
  const freshKyc = { ...kycDoc, createdAt: '2020-06-01T00:00:00Z' };
  const { service, state } = makeService({
    requiredTopics: [KYC], documents: [freshKyc],
    activeInterests: [{
      interestUid: 'int-1', tokenUid: 'tok-1', organizationUid: 'org-1', investorUid: 'inv-1',
      status: 'rejected', rejectReasonType: 'DOC_REJECTED', rejectedClaim: 'KYC',
      rejectedCount: 3, canResubmitClaim: 0, decisionAt: '2020-03-01T00:00:00Z',
    }],
  });
  await service.syncInterestsForInvestor('inv-1', 'user-inv');
  const event = state.history.find((h) => h.eventType === 'resubmitted');
  assert.ok(event);
  assert.equal(event.resubmitAttempt, 1);
  assert.equal(event.rejectedClaim, 'KYC');
  assert.equal(event.actorRole, 'investor');
});

test('my interest history returns the timeline and a resubmission summary (with ownership check)', async () => {
  const interest = {
    interestUid: 'int-1', tokenUid: 'tok-1', tokenName: 'Acme', investorUid: 'inv-1', organizationUid: 'org-1',
    status: 'rejected', rejectReasonType: 'DOC_REJECTED', rejectReason: 'blurry', rejectedClaim: 'KYC',
    rejectedCount: 3, canResubmitClaim: 1,
  };
  const history = [
    { historyUid: 'h1', interestUid: 'int-1', eventType: 'submitted', createdAt: '2020-01-01' },
    { historyUid: 'h2', interestUid: 'int-1', eventType: 'rejected', rejectReason: 'blurry', rejectedClaim: 'KYC', createdAt: '2020-01-02' },
    { historyUid: 'h3', interestUid: 'int-1', eventType: 'resubmitted', rejectedClaim: 'KYC', resubmitAttempt: 1, createdAt: '2020-01-03' },
    { historyUid: 'h4', interestUid: 'int-1', eventType: 'rejected', rejectReason: 'still blurry', rejectedClaim: 'KYC', createdAt: '2020-01-04' },
  ];
  const { service } = makeService({ interest, history });
  const result = await service.getMyInterestHistory(investor, 'int-1');
  assert.equal(result.timeline.length, 4);
  assert.deepEqual(result.timeline[1].rejectedClaim, ['KYC']);
  assert.equal(result.summary.timesRejected, 2);
  assert.equal(result.summary.timesResubmitted, 1);
  assert.equal(result.summary.rejectedCount, 3);
  assert.equal(result.summary.canResubmitClaim, 1);
  assert.equal(result.summary.resubmitRemaining, 2);
  assert.equal(result.summary.canResubmit, true);
});

test('my interest history rejects an interest owned by another investor', async () => {
  const { service } = makeService({ interest: { interestUid: 'int-1', investorUid: 'inv-OTHER', tokenUid: 'tok-1', organizationUid: 'org-1', status: 'rejected' } });
  await assert.rejects(service.getMyInterestHistory(investor, 'int-1'), (e) => e.statusCode === 404);
});

test('issuer interest history is scoped to the issuer organization', async () => {
  const foreign = { interestUid: 'int-1', organizationUid: 'org-OTHER', tokenUid: 'tok-1', investorUid: 'inv-1', status: 'rejected' };
  const { service } = makeService({ interest: foreign });
  await assert.rejects(service.getIssuerInterestHistory(issuer, 'int-1'), (e) => e.statusCode === 404);
});

test('issuer interest detail includes a resubmissionSummary', async () => {
  const interest = {
    interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', investorUid: 'inv-1', status: 'submitIntrest',
    rejectedCount: 3, canResubmitClaim: 1,
  };
  const history = [
    { historyUid: 'h1', interestUid: 'int-1', eventType: 'rejected', createdAt: '2020-01-01' },
    { historyUid: 'h2', interestUid: 'int-1', eventType: 'resubmitted', resubmitAttempt: 1, createdAt: '2020-01-02' },
  ];
  const { service } = makeService({ interest, history, requiredTopics: [KYC], documents: [kycDoc] });
  const detail = await service.getIssuerInterest(issuer, 'int-1');
  assert.equal(detail.resubmissionSummary.timesRejected, 1);
  assert.equal(detail.resubmissionSummary.timesResubmitted, 1);
  assert.equal(detail.resubmissionSummary.resubmitRemaining, 2);
});

// --------------------------------------------------------- issuer read/list

test('only issuers may list issuer interests', async () => {
  const { service } = makeService();
  await assert.rejects(service.listIssuerInterests(investor, {}), /only to issuer/i);
});

const snap = (over = {}) => ({
  historyUid: 'h1', interestUid: 'int-1', tokenUid: 'tok-1', organizationUid: 'org-1', investorUid: 'inv-1',
  submissionNumber: 1, documentUid: 'doc-kyc', documentTypeUid: 'dt-kyc', documentTypeName: 'Passport',
  documentCategory: 'kyc', claimTopicCode: 'KYC', versionNumber: 1, originalFileName: 'passport.pdf',
  storageKey: 'doc-kyc.pdf', mimeType: 'application/pdf', fileSize: 1000, ...over,
});

test('issuer interest detail shows the latest submission snapshot documents (not the live profile)', async () => {
  const owned = { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', investorUid: 'inv-1', status: 'submitIntrest', rejectedCount: 3, canResubmitClaim: 0 };
  const submissionDocs = [
    snap({ submissionNumber: 1, documentUid: 'doc-kyc-v1', versionNumber: 1, claimTopicCode: 'KYC' }),
    snap({ submissionNumber: 2, documentUid: 'doc-kyc-v2', versionNumber: 2, claimTopicCode: 'KYC' }),
    snap({ submissionNumber: 2, documentUid: 'doc-acc-v1', versionNumber: 1, claimTopicCode: 'ACCREDITED_INVESTOR', documentCategory: 'accredited', documentTypeName: 'Net Worth' }),
  ];
  const { service } = makeService({ interest: owned, requiredTopics: [KYC, ACC], submissionDocs });
  const detail = await service.getIssuerInterest(issuer, 'int-1');
  assert.equal(detail.submissionNumber, 2);
  // Only the latest submission (2) documents — the v1 passport from submission 1 is not shown.
  assert.deepEqual(detail.documents.map((d) => d.documentUid).sort(), ['doc-acc-v1', 'doc-kyc-v2']);
  assert.equal(detail.eligible, true);
});

test('issuer document download only resolves documents in this application snapshot', async () => {
  const owned = { interestUid: 'int-1', organizationUid: 'org-1', tokenUid: 'tok-1', investorUid: 'inv-1', status: 'submitIntrest' };
  const submissionDocs = [snap({ documentUid: 'doc-kyc-v2', storageKey: 'doc-kyc-v2.pdf' })];
  const { service } = makeService({ interest: owned, submissionDocs });
  // A document that was never submitted to this application is rejected (before any fs access).
  await assert.rejects(service.getIssuerInterestDocumentForDownload(issuer, 'int-1', 'doc-from-other-app'), (e) => e.statusCode === 404);
});

test('issuer document download rejects a foreign interest before touching the filesystem', async () => {
  const foreign = { interestUid: 'int-1', organizationUid: 'org-OTHER', investorUid: 'inv-1' };
  const { service } = makeService({ interest: foreign });
  await assert.rejects(service.getIssuerInterestDocumentForDownload(issuer, 'int-1', 'doc-kyc'), (e) => e.statusCode === 404);
});

test('submitting interest snapshots the current document versions for that submission', async () => {
  const { service, state } = makeService({ requiredTopics: [KYC], documents: [{ ...kycDoc, versionNumber: 2 }] });
  await service.submitInterest(investor, 'tok-1', {});
  assert.equal(state.submissionDocs.length, 1);
  assert.equal(state.submissionDocs[0].submissionNumber, 1);
  assert.equal(state.submissionDocs[0].documentUid, 'doc-kyc');
  assert.equal(state.submissionDocs[0].versionNumber, 2);
});

test('interest history attaches the submitted document versions to each submission event', async () => {
  const interest = { interestUid: 'int-1', tokenName: 'Acme', tokenUid: 'tok-1', investorUid: 'inv-1', organizationUid: 'org-1', status: 'submitIntrest', rejectedCount: 3, canResubmitClaim: 0 };
  const history = [{ historyUid: 'h1', interestUid: 'int-1', eventType: 'submitted', createdAt: '2020-01-01' }];
  const submissionDocs = [snap({ historyUid: 'h1', submissionNumber: 1, documentUid: 'doc-kyc-v1' })];
  const { service } = makeService({ interest, history, submissionDocs });
  const result = await service.getMyInterestHistory(investor, 'int-1');
  const submitted = result.timeline.find((e) => e.eventType === 'submitted');
  assert.equal(submitted.submissionNumber, 1);
  assert.equal(submitted.documents.length, 1);
  assert.ok(submitted.documents[0].downloadUrl.includes('/investors/me/documents/doc-kyc-v1/download'));
});
