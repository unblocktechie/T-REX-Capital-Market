const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { env } = require('../core/config/env');
const { logger } = require('./common/log.service');
const {
  SOURCES_OF_WEALTH,
  NET_WORTH_RANGES,
  INVESTMENT_CAPACITIES,
} = require('../repositories/investor-option.repository');

const requireFields = (data, fields, section) => {
  const missing = fields.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
  if (missing.length) {
    throw ApiError.badRequest(`${section} is incomplete.`, missing.map((field) => ({ field, message: `${field} is required.` })));
  }
};

const hashFile = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

const toDateOnly = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const calculateAge = (value) => {
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return -1;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
};

const generateProfileReference = () => `INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

class InvestorService {
  constructor({ repository, optionRepository, locationService, identityService, investmentService = null, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.optionRepository = optionRepository;
    this.locationService = locationService;
    // Reuses the shared OnchainID identity factory service (the same one the organization
    // approval flow uses) to create the investor's on-chain identity.
    this.identityService = identityService;
    // Optional: enforces the investment-interest document-upload gate and promotes/repairs
    // interest records after a submitted investor uploads claim documents.
    this.investmentService = investmentService;
    this.transactionRunner = transactionRunner;
  }

  // Redacts RPC/private-key secrets from a blockchain error, mirroring the organization flow.
  identityFailureMessage(error) {
    const raw = error.shortMessage || error.reason || error.message || 'Unknown blockchain error.';
    let safe = String(raw);
    const secrets = [env.blockchain.deployerPrivateKey, env.blockchain.sepoliaRpcUrl].filter(Boolean);
    for (const secret of secrets) safe = safe.split(secret).join('[REDACTED]');
    return `On-chain investor identity creation failed: ${safe}`.slice(0, 2000);
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') {
      throw ApiError.forbidden('Investor onboarding is available only to investor accounts.');
    }
  }

  assertEditable(investor) {
    if (investor && investor.status === 'submitted') {
      throw ApiError.conflict('Investor onboarding has already been submitted and can no longer be edited.');
    }
  }

  draftState() {
    return { isDraft: true, status: 'draft' };
  }

  validateComplianceOptions(fields) {
    if (fields.sourceOfWealth && !SOURCES_OF_WEALTH.includes(fields.sourceOfWealth)) {
      throw ApiError.badRequest('The selected source of wealth is not supported.');
    }
    if (fields.estimatedNetWorth && !NET_WORTH_RANGES.includes(fields.estimatedNetWorth)) {
      throw ApiError.badRequest('The selected net worth range is not supported.');
    }
    if (fields.annualInvestmentCapacity && !INVESTMENT_CAPACITIES.includes(fields.annualInvestmentCapacity)) {
      throw ApiError.badRequest('The selected annual investment capacity is not supported.');
    }
  }

  async getFullForm(user) {
    this.assertInvestor(user);
    const investor = await this.repository.findByUserUid(user.userUid);
    if (!investor) return null;
    const [investmentCategories, documents] = await Promise.all([
      this.repository.listInvestmentCategories(investor.investorUid),
      this.repository.listDocuments(investor.investorUid),
    ]);
    return { ...investor, investmentCategories, documents };
  }

  async saveIdentity(user, input) {
    this.assertInvestor(user);
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);
    const { isDraft, ...fields } = input;

    if (fields.dateOfBirth) {
      const age = calculateAge(fields.dateOfBirth);
      if (age < 0 || age > 120) throw ApiError.badRequest('Enter a valid date of birth.');
      if (age < 18) throw ApiError.badRequest('You must be at least 18 years old.');
      fields.dateOfBirth = toDateOnly(fields.dateOfBirth);
    }
    // Country / state / city are stored as location-master UIDs and validated as a
    // parent-child hierarchy (same as organization onboarding).
    await this.locationService.validateHierarchy(fields.countryUid, fields.stateUid, fields.cityUid);
    if (!isDraft) {
      requireFields(fields, ['firstName', 'lastName', 'dateOfBirth', 'streetAddress', 'countryUid', 'stateUid', 'cityUid'], 'Identity details');
    }

    const nextStep = isDraft ? (current?.currentStep || 'identityDetails') : 'identityDocuments';
    const data = { ...fields, currentStep: nextStep, ...this.draftState() };
    return current
      ? this.repository.updateByUserUid(user.userUid, data)
      : this.repository.createForUser(user.userUid, data);
  }

  async saveCompliance(user, input) {
    this.assertInvestor(user);
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);
    const { isDraft, investmentCategories = [], ...fields } = input;
    this.validateComplianceOptions(fields);

    // Clearing the description when there is no prior RWA experience mirrors the frontend.
    if (fields.previousRwaExperience === 'no') fields.rwaExperienceDescription = null;

    if (!isDraft) {
      requireFields(fields, ['sourceOfWealth', 'estimatedNetWorth', 'annualInvestmentCapacity', 'previousRwaExperience', 'accreditationType'], 'Compliance questionnaire');
      if (fields.yearsOfExperience === undefined || fields.yearsOfExperience === null || fields.yearsOfExperience === '') {
        throw ApiError.badRequest('Compliance questionnaire is incomplete.', [{ field: 'yearsOfExperience', message: 'yearsOfExperience is required.' }]);
      }
      if (!investmentCategories.length) throw ApiError.badRequest('Select at least one investment category.');
    }

    return this.transactionRunner(async (connection) => {
      const investor = current || await this.repository.createForUser(user.userUid, {
        currentStep: 'compliance', ...this.draftState(),
      }, connection);
      const categories = await this.repository.replaceInvestmentCategories(investor.investorUid, investmentCategories, connection);
      const nextStep = isDraft ? (current?.currentStep || 'compliance') : 'completed';
      const updated = await this.repository.updateByUserUid(user.userUid, {
        ...fields, currentStep: nextStep, ...this.draftState(),
      }, connection);
      return { ...updated, investmentCategories: categories };
    });
  }

  async uploadDocuments(user, documentTypeUid, files) {
    this.assertInvestor(user);
    if (!files?.length) throw ApiError.badRequest('At least one document file is required.');
    const current = await this.repository.findByUserUid(user.userUid);
    if (!current) throw ApiError.badRequest('Save your identity details before uploading documents.');
    // A submitted investor may upload documents only to satisfy a pending / resubmittable
    // investment-interest request; a non-submitted (draft) investor uploads normally.
    if (current.status === 'submitted' && this.investmentService) {
      await this.investmentService.assertClaimUploadAllowed(current.investorUid);
    } else {
      this.assertEditable(current);
    }
    const documentType = await this.optionRepository.findDocumentType(documentTypeUid);
    if (!documentType) throw ApiError.badRequest('The selected document type does not exist.');

    const fileRecords = await Promise.all(files.map(async (file) => ({
      investorUid: current.investorUid,
      documentTypeUid,
      documentCategory: documentType.documentCategory,
      // Claim topic the uploaded document satisfies (KYC / ACCREDITED_INVESTOR). Falls back
      // to the category mapping for legacy document types created before the column existed.
      claimTopicCode: documentType.claimTopicCode
        || (documentType.documentCategory === 'kyc' ? 'KYC' : 'ACCREDITED_INVESTOR'),
      originalFileName: file.originalname,
      storedFileName: file.filename,
      storageKey: file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
      checksumSha256: await hashFile(file.path),
    })));

    const { documents } = await this.transactionRunner(async (connection) => {
      // Versioned "current profile" document per type. Uploading a new document of an existing
      // type supersedes the previous version (isCurrent = 0) but KEEPS the old row and file for
      // audit/history, so past application submissions keep resolving their exact version.
      const existing = await this.repository.findActiveDocumentByType(current.investorUid, documentTypeUid, connection);
      const nextVersion = existing ? Number(existing.versionNumber || 1) + 1 : 1;
      if (existing) await this.repository.markDocumentNotCurrent(existing.documentUid, connection);
      const created = [];
      for (const record of fileRecords) {
        created.push(await this.repository.createDocument({
          ...record, versionNumber: nextVersion, isCurrent: true, uploadedByUserUid: user.userUid,
        }, connection));
      }
      if (documentType.documentCategory === 'kyc' && current.currentStep === 'identityDetails') {
        await this.repository.updateByUserUid(user.userUid, { currentStep: 'identityDocuments', ...this.draftState() }, connection);
      }
      return { documents: created };
    });
    // Note: superseded versions and their files are intentionally retained (never unlinked).

    // After a submitted investor changes documents, promote pending interests that are now
    // complete and resolve DOC_REJECTED interests whose rejected claims were re-uploaded.
    if (current.status === 'submitted' && this.investmentService) {
      await this.investmentService.syncInterestsForInvestor(current.investorUid, user.userUid);
    }
    return documents;
  }

  async listDocuments(user) {
    this.assertInvestor(user);
    const investor = await this.repository.findByUserUid(user.userUid);
    return investor ? this.repository.listDocuments(investor.investorUid) : [];
  }

  async getDocumentForDownload(user, documentUid) {
    this.assertInvestor(user);
    const investor = await this.repository.findByUserUid(user.userUid);
    if (!investor) throw ApiError.notFound('Investor onboarding was not found.');
    const document = await this.repository.findDocument(investor.investorUid, documentUid);
    if (!document) throw ApiError.notFound('Document was not found.');
    const filePath = path.resolve(env.investorUploads.directory, document.storageKey);
    if (!filePath.startsWith(`${env.investorUploads.directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw ApiError.notFound('The document file is no longer available.');
    }
    return { document, filePath };
  }

  async deleteDocument(user, documentUid) {
    this.assertInvestor(user);
    const investor = await this.repository.findByUserUid(user.userUid);
    if (!investor) throw ApiError.notFound('Investor onboarding was not found.');
    this.assertEditable(investor);
    const document = await this.repository.findDocument(investor.investorUid, documentUid);
    if (!document) throw ApiError.notFound('Document was not found.');
    const filePath = path.resolve(env.investorUploads.directory, document.storageKey);
    if (!filePath.startsWith(`${env.investorUploads.directory}${path.sep}`)) {
      throw ApiError.badRequest('The document storage path is invalid.');
    }
    await this.repository.softDeleteDocument(investor.investorUid, documentUid);
    fs.promises.unlink(filePath).catch((error) => {
      if (error.code !== 'ENOENT') logger.warn('Could not remove investor document file', { documentUid, error });
    });
  }

  async submit(user, { walletAddress }) {
    this.assertInvestor(user);
    const investor = await this.repository.findByUserUid(user.userUid);
    if (!investor) throw ApiError.badRequest('Investor onboarding has not been started.');
    this.assertEditable(investor);

    requireFields(investor, [
      'firstName', 'lastName', 'dateOfBirth', 'streetAddress', 'countryUid', 'stateUid', 'cityUid',
      'sourceOfWealth', 'estimatedNetWorth', 'annualInvestmentCapacity', 'previousRwaExperience', 'accreditationType',
    ], 'Investor onboarding form');
    if (investor.yearsOfExperience === undefined || investor.yearsOfExperience === null) {
      throw ApiError.badRequest('Years of investment experience is required.');
    }
    if (calculateAge(investor.dateOfBirth) < 18) throw ApiError.badRequest('You must be at least 18 years old.');
    await this.locationService.validateHierarchy(investor.countryUid, investor.stateUid, investor.cityUid);

    const categories = await this.repository.listInvestmentCategories(investor.investorUid);
    if (!categories.length) throw ApiError.badRequest('Select at least one investment category.');
    const kycCount = await this.repository.countDocumentsByCategory(investor.investorUid, 'kyc');
    if (!kycCount) throw ApiError.badRequest('Upload at least one identity (KYC) document.');
    const accreditedCount = await this.repository.countDocumentsByCategory(investor.investorUid, 'accredited');
    if (!accreditedCount) throw ApiError.badRequest('Upload at least one accreditation document.');

    // On-chain OnchainID identity creation — same pattern as the organization approval flow.
    // The submission is only finalized to 'submitted' once this succeeds.
    let contractResult;
    try {
      // Same OnchainID identity factory call the organization approval uses
      // (createOrganizationIdentity is the generic getIdentity/createIdentity routine).
      contractResult = await this.identityService.createOrganizationIdentity(walletAddress, `investor-${investor.investorUid}`);
    } catch (error) {
      const contractTxnMessage = this.identityFailureMessage(error);
      await this.repository.updateByUserUid(user.userUid, {
        walletAddress,
        contractTxnHash: error.transactionHash || null,
        contractTxnMessage,
      });
      throw new ApiError(502, contractTxnMessage, { contractTxnMessage }, 'INVESTOR_IDENTITY_CREATION_FAILED');
    }

    const contractTxnMessage = contractResult.alreadyExisted
      ? 'On-chain investor identity already existed; onboarding submitted successfully.'
      : 'On-chain investor identity created; onboarding submitted successfully.';

    return this.repository.updateByUserUid(user.userUid, {
      walletAddress,
      profileReference: investor.profileReference || generateProfileReference(),
      onchainIdReference: contractResult.identityAddress,
      contractAddress: contractResult.identityAddress,
      contractTxnHash: contractResult.txHash,
      contractTxnMessage,
      currentStep: 'completed',
      isDraft: false,
      status: 'submitted',
      submittedAt: new Date(),
    });
  }
}

module.exports = { InvestorService, requireFields, hashFile, calculateAge };
