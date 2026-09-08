const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { env } = require('../core/config/env');
const { logger } = require('./common/log.service');

const requireFields = (data, fields, section) => {
  const missing = fields.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
  if (missing.length) throw ApiError.badRequest(`${section} is incomplete.`, missing.map((field) => ({ field, message: `${field} is required.` })));
};

const hashFile = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

class OrganizationService {
  constructor({ repository, optionRepository, locationService }) {
    this.repository = repository;
    this.optionRepository = optionRepository;
    this.locationService = locationService;
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') throw ApiError.forbidden('Organization onboarding is available only to issuer accounts.');
  }

  assertEditable(organization) {
    if (organization && ['submitted', 'resubmitted', 'underReview', 'approved'].includes(organization.status)) {
      throw ApiError.conflict(`Organization cannot be edited while its status is ${organization.status}.`);
    }
    if (organization?.status === 'rejected' && !organization.canResubmit) {
      throw ApiError.conflict('The organization revision opportunity has already been used. Please contact Sales for assistance.');
    }
  }

  draftState(organization) {
    const isRejectedRevision = organization?.status === 'rejected' && Boolean(organization.canResubmit);
    return {
      isDraft: true,
      status: isRejectedRevision ? 'rejected' : 'draft',
      submittedAt: isRejectedRevision ? organization.submittedAt : null,
    };
  }

  submissionStatus(organization) {
    return Number(organization?.rejectionCount || 0) > 0 ? 'resubmitted' : 'submitted';
  }

  async getFullForm(user) {
    this.assertIssuer(user);
    const organization = await this.repository.findByUserUid(user.userUid);
    if (!organization) return null;
    const [beneficialOwners, documents] = await Promise.all([
      this.repository.listBeneficialOwners(organization.organizationUid),
      this.repository.listDocuments(organization.organizationUid),
    ]);
    return { ...organization, beneficialOwners, documents };
  }

  async markUserNotified(user) {
    this.assertIssuer(user);
    const organization = await this.repository.findByUserUid(user.userUid);
    if (!organization) throw ApiError.notFound('Organization was not found.');
    return this.repository.updateByUserUid(user.userUid, { isUserNotified: true });
  }

  async saveCompanyInformation(user, input) {
    this.assertIssuer(user);
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);
    if (!input.isDraft) {
      requireFields(input, ['legalCompanyName', 'entityTypeUid', 'registrationNumber', 'streetAddress', 'countryUid', 'stateUid', 'cityUid', 'postalCode'], 'Company information');
    }
    if (input.entityTypeUid && !await this.optionRepository.findEntityType(input.entityTypeUid)) {
      throw ApiError.badRequest('The selected entity type does not exist.');
    }
    await this.locationService.validateHierarchy(input.countryUid, input.stateUid, input.cityUid);
    const { isDraft, ...fields } = input;
    const nextStep = isDraft ? (current?.currentStep || 'companyInformation') : 'jurisdiction';
    const data = { ...fields, currentStep: nextStep, ...this.draftState(current) };
    return current
      ? this.repository.updateByUserUid(user.userUid, data)
      : this.repository.createForUser(user.userUid, data);
  }

  async saveJurisdiction(user, input) {
    this.assertIssuer(user);
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);
    if (!input.isDraft) {
      requireFields(input, ['countryOfIncorporationUid', 'dateOfIncorporation', 'taxIdentificationNumber', 'industryUid', 'businessActivity'], 'Jurisdiction information');
    }
    if (input.countryOfIncorporationUid && !await this.locationService.repository.findCountry(input.countryOfIncorporationUid)) {
      throw ApiError.badRequest('The selected country of incorporation does not exist.');
    }
    if (input.industryUid && !await this.optionRepository.findIndustry(input.industryUid)) {
      throw ApiError.badRequest('The selected industry does not exist.');
    }
    const { isDraft, ...fields } = input;
    const data = {
      ...fields,
      currentStep: isDraft ? (current?.currentStep || 'jurisdiction') : 'beneficialOwners',
      ...this.draftState(current),
    };
    return current
      ? this.repository.updateByUserUid(user.userUid, data)
      : this.repository.createForUser(user.userUid, data);
  }

  validateOwners(owners, isDraft) {
    if (!isDraft && !owners.length) throw ApiError.badRequest('At least one ultimate beneficial owner is required.');
    let totalBasisPoints = 0;
    const adultCutoff = new Date();
    adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
    for (const [index, owner] of owners.entries()) {
      if (!isDraft) requireFields(owner, ['fullName', 'dateOfBirth', 'nationalityCountryUid', 'ownershipPercentage'], `Beneficial owner ${index + 1}`);
      if (owner.dateOfBirth && new Date(owner.dateOfBirth) > adultCutoff) throw ApiError.badRequest(`Beneficial owner ${index + 1} must be at least 18 years old.`);
      if (owner.ownershipPercentage !== undefined && owner.ownershipPercentage !== null) {
        totalBasisPoints += Math.round(Number(owner.ownershipPercentage) * 100);
      }
    }
    if (isDraft && totalBasisPoints > 10000) {
      throw ApiError.badRequest('Total beneficial ownership cannot exceed 100%.');
    }
    if (!isDraft && totalBasisPoints !== 10000) {
      throw ApiError.badRequest('Total beneficial ownership must equal 100%.');
    }
    if (owners.filter((owner) => owner.isPrimary).length > 1) throw ApiError.badRequest('Only one beneficial owner can be marked as primary.');
  }

  async saveBeneficialOwners(user, input) {
    this.assertIssuer(user);
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);
    this.validateOwners(input.owners, input.isDraft);
    for (const [index, owner] of input.owners.entries()) {
      if (owner.nationalityCountryUid && !await this.locationService.repository.findCountry(owner.nationalityCountryUid)) {
        throw ApiError.badRequest(`Beneficial owner ${index + 1} has an invalid nationality country.`);
      }
    }
    return withTransaction(async (connection) => {
      const organization = current || await this.repository.createForUser(user.userUid, {
        currentStep: 'beneficialOwners', isDraft: true, status: 'draft',
      }, connection);
      const owners = await this.repository.replaceBeneficialOwners(organization.organizationUid, input.owners, connection);
      await this.repository.updateByUserUid(user.userUid, {
        currentStep: input.isDraft ? organization.currentStep : 'documents',
        ...this.draftState(current),
      }, connection);
      return owners;
    });
  }

  async uploadDocuments(user, documentTypeUid, files) {
    this.assertIssuer(user);
    if (!files?.length) throw ApiError.badRequest('At least one document file is required.');
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);
    if (!current) throw ApiError.badRequest('Save company information before uploading documents.');
    if (!await this.optionRepository.findDocumentType(documentTypeUid)) throw ApiError.badRequest('The selected document type does not exist.');
    const fileRecords = await Promise.all(files.map(async (file) => ({
      organizationUid: current.organizationUid,
      documentTypeUid,
      originalFileName: file.originalname,
      storedFileName: file.filename,
      storageKey: file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
      checksumSha256: await hashFile(file.path),
    })));
    return withTransaction(async (connection) => {
      const documents = [];
      for (const record of fileRecords) documents.push(await this.repository.createDocument(record, connection));
      await this.repository.updateByUserUid(user.userUid, {
        currentStep: 'documents', ...this.draftState(current),
      }, connection);
      return documents;
    });
  }

  async listDocuments(user) {
    this.assertIssuer(user);
    const organization = await this.repository.findByUserUid(user.userUid);
    return organization ? this.repository.listDocuments(organization.organizationUid) : [];
  }

  async getDocumentForDownload(user, documentUid) {
    this.assertIssuer(user);
    const organization = await this.repository.findByUserUid(user.userUid);
    if (!organization) throw ApiError.notFound('Organization was not found.');
    const document = await this.repository.findDocument(organization.organizationUid, documentUid);
    if (!document) throw ApiError.notFound('Document was not found.');
    const filePath = path.resolve(env.uploads.directory, document.storageKey);
    if (!filePath.startsWith(`${env.uploads.directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw ApiError.notFound('The document file is no longer available.');
    }
    return { document, filePath };
  }

  async deleteDocument(user, documentUid) {
    this.assertIssuer(user);
    const organization = await this.repository.findByUserUid(user.userUid);
    if (!organization) throw ApiError.notFound('Organization was not found.');
    this.assertEditable(organization);
    const document = await this.repository.findDocument(organization.organizationUid, documentUid);
    if (!document) throw ApiError.notFound('Document was not found.');
    const filePath = path.resolve(env.uploads.directory, document.storageKey);
    if (!filePath.startsWith(`${env.uploads.directory}${path.sep}`)) {
      throw ApiError.badRequest('The document storage path is invalid.');
    }
    await this.repository.softDeleteDocument(document.organizationUid, documentUid);
    await this.repository.updateByUserUid(user.userUid, {
      ...this.draftState(organization),
    });
    fs.promises.unlink(filePath).catch((error) => {
      if (error.code !== 'ENOENT') logger.warn('Could not remove organization document file', { documentUid, error });
    });
  }

  async submit(user, { walletAddress }) {
    this.assertIssuer(user);
    const organization = await this.repository.findByUserUid(user.userUid);
    if (!organization) throw ApiError.badRequest('Organization form has not been started.');
    this.assertEditable(organization);
    requireFields(organization, [
      'legalCompanyName', 'entityTypeUid', 'registrationNumber', 'streetAddress', 'countryUid', 'stateUid', 'cityUid', 'postalCode',
      'countryOfIncorporationUid', 'dateOfIncorporation', 'taxIdentificationNumber', 'industryUid', 'businessActivity',
    ], 'Organization form');
    await this.locationService.validateHierarchy(organization.countryUid, organization.stateUid, organization.cityUid);
    if (!await this.locationService.repository.findCountry(organization.countryOfIncorporationUid)) throw ApiError.badRequest('Country of incorporation is invalid.');
    if (!await this.optionRepository.findEntityType(organization.entityTypeUid)) throw ApiError.badRequest('Entity type is invalid.');
    if (!await this.optionRepository.findIndustry(organization.industryUid)) throw ApiError.badRequest('Industry is invalid.');
    const owners = await this.repository.listBeneficialOwners(organization.organizationUid);
    this.validateOwners(owners, false);
    const documents = await this.repository.listDocuments(organization.organizationUid);
    const requiredTypes = await this.optionRepository.listRequiredDocumentTypes();
    const uploadedTypes = new Set(documents.map((document) => document.documentTypeUid));
    const missingDocuments = requiredTypes.filter((type) => !uploadedTypes.has(type.documentTypeUid));
    if (missingDocuments.length) {
      throw ApiError.badRequest('Required organization documents are missing.', missingDocuments.map((type) => ({
        documentTypeUid: type.documentTypeUid, documentTypeCode: type.documentTypeCode, message: `${type.documentTypeName} is required.`,
      })));
    }
    return this.repository.updateByUserUid(user.userUid, {
      walletAddress,
      currentStep: 'completed',
      isDraft: false,
      status: this.submissionStatus(organization),
      submittedAt: new Date(),
      rejectionReason: null,
      canResubmit: false,
      isUserNotified: false,
    });
  }
}

module.exports = { OrganizationService, requireFields, hashFile };
