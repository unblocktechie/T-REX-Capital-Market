const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../../src/schemas/investor.schema');
const { InvestorService } = require('../../src/services/investor.service');

const investor = { userUid: 'user-1', roleName: 'Investor' };
const runner = (work) => work({});
const locationService = { validateHierarchy: async () => {} };

const COUNTRY_UID = '00000000-0000-4000-8000-000000000840';
const STATE_UID = '00000000-0000-4000-8000-000000000841';
const CITY_UID = '00000000-0000-4000-8000-000000000842';

const makeRepo = (seed = null) => ({
  investor: seed,
  categories: seed?.investmentCategories || [],
  kyc: 0,
  accredited: 0,
  async findByUserUid() { return this.investor; },
  async findSubmittedByWalletAddress() { return this.walletOwner || null; },
  async createForUser(userUid, data) {
    this.investor = { investorUid: 'inv-1', userUid, status: 'draft', currentStep: 'identityDetails', ...data };
    return { ...this.investor };
  },
  async updateByUserUid(userUid, data) { this.investor = { ...this.investor, ...data }; return { ...this.investor }; },
  async listInvestmentCategories() { return this.categories; },
  async replaceInvestmentCategories(uid, codes) { this.categories = codes; return codes; },
  async listDocuments() { return []; },
  async countDocumentsByCategory(uid, category) { return category === 'kyc' ? this.kyc : this.accredited; },
  async findActiveDocumentByType() { return null; },
  async createDocument(record) { return { documentUid: 'doc-1', ...record }; },
});

const optionRepo = {
  findDocumentType: async (uid) => {
    if (uid === 'kyc-type') return { documentTypeUid: uid, documentCategory: 'kyc' };
    if (uid === 'acc-type') return { documentTypeUid: uid, documentCategory: 'accredited' };
    return null;
  },
};

const IDENTITY_ADDR = `0x${'a'.repeat(40)}`;
const IDENTITY_TX = `0x${'b'.repeat(64)}`;
const identityOk = {
  createOrganizationIdentity: async () => ({ identityAddress: IDENTITY_ADDR, txHash: IDENTITY_TX, alreadyExisted: false }),
};

const makeService = (repo, overrides = {}) => new InvestorService({
  repository: repo, optionRepository: optionRepo, locationService,
  identityService: overrides.identityService || identityOk, transactionRunner: runner,
  walletOwnershipRepository: overrides.walletOwnershipRepository || { findIssuerOwner: async () => null },
});

const completeInvestor = () => ({
  investorUid: 'inv-1', userUid: 'user-1', status: 'draft', currentStep: 'completed',
  firstName: 'Lois', lastName: 'Hall', dateOfBirth: '1990-03-10', streetAddress: '221B Baker Street',
  countryUid: COUNTRY_UID, stateUid: STATE_UID, cityUid: CITY_UID,
  sourceOfWealth: 'Business Ownership', estimatedNetWorth: 'Below $100,000',
  annualInvestmentCapacity: '$500,000 – $1,000,000', yearsOfExperience: 5,
  previousRwaExperience: 'no', accreditationType: 'institutional',
});

// ---- schema ----

test('identity schema accepts a valid payload and rejects an invalid name', () => {
  const ok = schemas.identityDetails.validate({
    firstName: 'Lois', lastName: 'Hall', dateOfBirth: '1990-03-10', gender: 'male',
    streetAddress: '221B Baker Street', countryUid: COUNTRY_UID, stateUid: STATE_UID,
    cityUid: CITY_UID, isDraft: false,
  });
  assert.equal(ok.error, undefined);
  assert.ok(schemas.identityDetails.validate({ firstName: '1234', isDraft: true }).error);
});

test('compliance schema rejects an unknown investment category', () => {
  assert.ok(schemas.compliance.validate({ investmentCategories: ['nope'], isDraft: true }).error);
  const ok = schemas.compliance.validate({
    sourceOfWealth: 'Business Ownership', estimatedNetWorth: 'Below $100,000',
    annualInvestmentCapacity: '$500,000 – $1,000,000', investmentCategories: ['public_markets', 'digital_assets'],
    yearsOfExperience: 5, previousRwaExperience: 'no', accreditationType: 'institutional', isDraft: false,
  });
  assert.equal(ok.error, undefined);
});

test('submit schema requires a valid EVM wallet address', () => {
  assert.equal(schemas.submitInvestor.validate({ walletAddress: `0x${'1'.repeat(40)}` }).error, undefined);
  assert.ok(schemas.submitInvestor.validate({ walletAddress: '0x1234' }).error);
});

// ---- service ----

test('only investor accounts can access onboarding', async () => {
  const service = makeService(makeRepo());
  await assert.rejects(
    service.getFullForm({ userUid: 'u', roleName: 'Issuer' }),
    /available only to investor accounts/i,
  );
});

test('saving identity as a draft creates the investor record', async () => {
  const repo = makeRepo();
  const service = makeService(repo);
  const result = await service.saveIdentity(investor, { firstName: 'Lois', isDraft: true });
  assert.equal(result.status, 'draft');
  assert.equal(repo.investor.firstName, 'Lois');
});

test('completing identity requires all fields and advances the step', async () => {
  const repo = makeRepo();
  const service = makeService(repo);
  await assert.rejects(
    service.saveIdentity(investor, { firstName: 'Lois', isDraft: false }),
    (error) => error.statusCode === 400,
  );
  const ok = await service.saveIdentity(investor, {
    firstName: 'Lois', lastName: 'Hall', dateOfBirth: '1990-03-10', streetAddress: '221B Baker Street',
    countryUid: COUNTRY_UID, stateUid: STATE_UID, cityUid: CITY_UID, isDraft: false,
  });
  assert.equal(ok.currentStep, 'identityDocuments');
});

test('identity rejects an applicant under 18', async () => {
  const service = makeService(makeRepo());
  await assert.rejects(
    service.saveIdentity(investor, { firstName: 'Kid', lastName: 'Young', dateOfBirth: '2015-01-01', streetAddress: '1 A Street', countryUid: COUNTRY_UID, stateUid: STATE_UID, cityUid: CITY_UID, isDraft: false }),
    /at least 18 years old/i,
  );
});

test('completing compliance requires categories and replaces them', async () => {
  const repo = makeRepo({ investorUid: 'inv-1', userUid: 'user-1', status: 'draft', currentStep: 'identityDocuments' });
  const service = makeService(repo);
  await assert.rejects(
    service.saveCompliance(investor, {
      sourceOfWealth: 'Business Ownership', estimatedNetWorth: 'Below $100,000',
      annualInvestmentCapacity: '$500,000 – $1,000,000', investmentCategories: [], yearsOfExperience: 5,
      previousRwaExperience: 'no', accreditationType: 'institutional', isDraft: false,
    }),
    /at least one investment category/i,
  );
  const ok = await service.saveCompliance(investor, {
    sourceOfWealth: 'Business Ownership', estimatedNetWorth: 'Below $100,000',
    annualInvestmentCapacity: '$500,000 – $1,000,000', investmentCategories: ['public_markets', 'digital_assets'],
    yearsOfExperience: 5, previousRwaExperience: 'no', accreditationType: 'institutional', isDraft: false,
  });
  assert.equal(ok.currentStep, 'completed');
  assert.deepEqual(repo.categories, ['public_markets', 'digital_assets']);
});

test('uploading a KYC document advances from identityDetails to identityDocuments', async () => {
  const repo = makeRepo({ investorUid: 'inv-1', userUid: 'user-1', status: 'draft', currentStep: 'identityDetails' });
  const service = makeService(repo);
  const docs = await service.uploadDocuments(investor, 'kyc-type', [{ originalname: 'id.pdf', filename: 'stored.pdf', mimetype: 'application/pdf', size: 1234, path: __filename }]);
  assert.equal(docs[0].documentCategory, 'kyc');
  assert.equal(repo.investor.currentStep, 'identityDocuments');
});

test('re-uploading a document type creates a new version and retains (supersedes) the previous one', async () => {
  const docs = [];
  let current = null;
  const repo = {
    findByUserUid: async () => ({ investorUid: 'inv-1', userUid: 'user-1', status: 'draft', currentStep: 'identityDocuments' }),
    findActiveDocumentByType: async () => current,
    markDocumentNotCurrent: async (documentUid) => { const d = docs.find((x) => x.documentUid === documentUid); if (d) d.isCurrent = false; },
    createDocument: async (rec) => {
      const d = { documentUid: `doc${docs.length + 1}`, isCurrent: rec.isCurrent, versionNumber: rec.versionNumber, documentCategory: rec.documentCategory };
      docs.push(d);
      current = { documentUid: d.documentUid, storageKey: rec.storageKey, versionNumber: rec.versionNumber };
      return d;
    },
    updateByUserUid: async () => {},
  };
  const service = new InvestorService({ repository: repo, optionRepository: optionRepo, locationService, identityService: identityOk, transactionRunner: runner });
  const file = { originalname: 'p.pdf', filename: 's1.pdf', mimetype: 'application/pdf', size: 1, path: __filename };
  const first = await service.uploadDocuments(investor, 'kyc-type', [file]);
  assert.equal(first[0].versionNumber, 1);
  const second = await service.uploadDocuments(investor, 'kyc-type', [{ ...file, filename: 's2.pdf' }]);
  assert.equal(second[0].versionNumber, 2);
  assert.equal(docs.length, 2, 'the old version is retained, not deleted');
  assert.equal(docs[0].isCurrent, false);
  assert.equal(docs[1].isCurrent, true);
});

test('a submitted investor may upload documents only when the investment gate allows it', async () => {
  const repo = makeRepo({ investorUid: 'inv-1', userUid: 'user-1', status: 'submitted', currentStep: 'completed' });
  let gateCalled = false;
  let syncCalled = false;
  const investmentService = {
    assertClaimUploadAllowed: async () => { gateCalled = true; },
    syncInterestsForInvestor: async () => { syncCalled = true; },
  };
  const service = new InvestorService({
    repository: repo, optionRepository: optionRepo, locationService,
    identityService: identityOk, investmentService, transactionRunner: runner,
  });
  const docs = await service.uploadDocuments(investor, 'kyc-type', [{ originalname: 'id.pdf', filename: 'stored.pdf', mimetype: 'application/pdf', size: 1234, path: __filename }]);
  assert.ok(gateCalled, 'upload gate should be consulted for a submitted investor');
  assert.ok(syncCalled, 'interests should be synced after a submitted investor uploads');
  assert.equal(docs[0].documentCategory, 'kyc');
});

test('a submitted investor is blocked from uploading when the investment gate rejects', async () => {
  const repo = makeRepo({ investorUid: 'inv-1', userUid: 'user-1', status: 'submitted', currentStep: 'completed' });
  const investmentService = {
    assertClaimUploadAllowed: async () => { const error = new Error('not allowed'); error.statusCode = 403; throw error; },
    syncInterestsForInvestor: async () => {},
  };
  const service = new InvestorService({
    repository: repo, optionRepository: optionRepo, locationService,
    identityService: identityOk, investmentService, transactionRunner: runner,
  });
  await assert.rejects(
    service.uploadDocuments(investor, 'kyc-type', [{ originalname: 'id.pdf', filename: 'stored.pdf', mimetype: 'application/pdf', size: 1234, path: __filename }]),
    (error) => error.statusCode === 403,
  );
});

test('submit fails without the required documents, then succeeds and finalizes as submitted', async () => {
  const repo = makeRepo(completeInvestor());
  repo.categories = ['public_markets'];
  const service = makeService(repo);

  // No documents yet -> rejected.
  await assert.rejects(service.submit(investor, { walletAddress: `0x${'1'.repeat(40)}` }), /identity \(KYC\) document/i);

  repo.kyc = 1;
  await assert.rejects(service.submit(investor, { walletAddress: `0x${'1'.repeat(40)}` }), /accreditation document/i);

  repo.accredited = 1;
  const result = await service.submit(investor, { walletAddress: `0x${'1'.repeat(40)}` });
  assert.equal(result.status, 'submitted');
  assert.equal(result.isDraft, false);
  assert.equal(result.currentStep, 'completed');
  assert.match(result.profileReference, /^INV-[0-9A-F]{8}$/);
  assert.equal(result.onchainIdReference, IDENTITY_ADDR);
  assert.equal(result.contractAddress, IDENTITY_ADDR);
  assert.equal(result.contractTxnHash, IDENTITY_TX);
});

test('submit rejects a wallet already registered to another investor before calling the blockchain', async () => {
  const repo = makeRepo(completeInvestor());
  repo.walletOwner = { investorUid: 'inv-2', userUid: 'user-2', status: 'submitted' };
  let identityCalls = 0;
  const service = makeService(repo, {
    identityService: {
      createOrganizationIdentity: async () => {
        identityCalls += 1;
        return { identityAddress: IDENTITY_ADDR, txHash: IDENTITY_TX, alreadyExisted: true };
      },
    },
  });

  await assert.rejects(
    service.submit(investor, { walletAddress: `0x${'A'.repeat(40)}` }),
    (error) => error.statusCode === 409 && error.code === 'INVESTOR_WALLET_ALREADY_REGISTERED',
  );
  assert.equal(identityCalls, 0);
  assert.equal(repo.investor.status, 'draft');
});

test('submit rejects an issuer wallet before creating an investor identity', async () => {
  const repo = makeRepo(completeInvestor());
  let identityCalls = 0;
  const service = makeService(repo, {
    walletOwnershipRepository: {
      findIssuerOwner: async () => ({ organizationUid: 'org-2', userUid: 'issuer-2', roleName: 'Issuer' }),
    },
    identityService: {
      createOrganizationIdentity: async () => {
        identityCalls += 1;
        return { identityAddress: IDENTITY_ADDR, txHash: IDENTITY_TX, alreadyExisted: true };
      },
    },
  });

  await assert.rejects(
    service.submit(investor, { walletAddress: `0x${'B'.repeat(40)}` }),
    (error) => error.statusCode === 409 && error.code === 'WALLET_ALREADY_ASSIGNED_TO_ISSUER',
  );
  assert.equal(identityCalls, 0);
  assert.equal(repo.investor.status, 'draft');
});

test('submit translates a concurrent registered-wallet unique conflict into the wallet-specific response', async () => {
  const repo = makeRepo(completeInvestor());
  repo.categories = ['public_markets'];
  repo.kyc = 1;
  repo.accredited = 1;
  repo.updateByUserUid = async (userUid, data) => {
    if (data.status === 'submitted') {
      const error = new Error("Duplicate entry for key 'ukInvestorMasterRegisteredWallet'");
      error.code = 'ER_DUP_ENTRY';
      error.sqlMessage = error.message;
      throw error;
    }
    repo.investor = { ...repo.investor, ...data };
    return { ...repo.investor };
  };
  const service = makeService(repo);

  await assert.rejects(
    service.submit(investor, { walletAddress: `0x${'2'.repeat(40)}` }),
    (error) => error.statusCode === 409 && error.code === 'INVESTOR_WALLET_ALREADY_REGISTERED',
  );
});

test('submit returns 502 and stays draft when on-chain identity creation fails', async () => {
  const repo = makeRepo(completeInvestor());
  repo.categories = ['public_markets'];
  repo.kyc = 1;
  repo.accredited = 1;
  const failingHash = `0x${'c'.repeat(64)}`;
  const failing = {
    createOrganizationIdentity: async () => {
      const error = new Error('execution reverted');
      error.transactionHash = failingHash;
      throw error;
    },
  };
  const service = makeService(repo, { identityService: failing });
  await assert.rejects(
    service.submit(investor, { walletAddress: `0x${'1'.repeat(40)}` }),
    (error) => error.code === 'INVESTOR_IDENTITY_CREATION_FAILED' && error.statusCode === 502,
  );
  assert.equal(repo.investor.status, 'draft');
  assert.equal(repo.investor.contractTxnHash, failingHash);
});

test('a submitted investor form can no longer be edited', async () => {
  const repo = makeRepo({ investorUid: 'inv-1', userUid: 'user-1', status: 'submitted' });
  const service = makeService(repo);
  await assert.rejects(
    service.saveIdentity(investor, { firstName: 'Lois', isDraft: true }),
    (error) => error.statusCode === 409,
  );
});
