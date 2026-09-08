const fs = require('node:fs');
const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { logger } = require('./common/log.service');

const requiredFields = (data, fields, section) => {
  const missing = fields.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
  if (missing.length) {
    throw ApiError.badRequest(
      `${section} is incomplete.`,
      missing.map((field) => ({ field, message: `${field} is required.` })),
    );
  }
};

class TokenService {
  constructor({
    repository,
    organizationRepository,
    optionRepository,
    locationRepository,
    imageService,
    deploymentReceiptService,
    transactionRunner = withTransaction,
  }) {
    this.repository = repository;
    this.organizationRepository = organizationRepository;
    this.optionRepository = optionRepository;
    this.locationRepository = locationRepository;
    this.imageService = imageService;
    this.deploymentReceiptService = deploymentReceiptService;
    this.transactionRunner = transactionRunner;
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') {
      throw ApiError.forbidden('Token creation is available only to issuer accounts.');
    }
  }

  async approvedOrganization(user, executor) {
    this.assertIssuer(user);
    const organization = await this.organizationRepository.findByUserUid(user.userUid, executor);
    if (!organization) throw ApiError.badRequest('Create and submit an organization before creating a token.');
    if (organization.status !== 'approved') {
      throw ApiError.conflict('The organization must be approved before token creation can begin.');
    }
    if (!organization.walletAddress || !ethers.isAddress(organization.walletAddress)) {
      throw ApiError.badRequest('The approved organization does not have a valid wallet address.');
    }
    return organization;
  }

  assertEditable(token) {
    if (token && ['readyToDeploy', 'deployed'].includes(token.status)) {
      throw ApiError.conflict(`Token cannot be edited while its status is ${token.status}.`);
    }
  }

  async getFullToken(user) {
    await this.approvedOrganization(user);
    const token = await this.repository.findByUserUid(user.userUid);
    if (!token) return null;
    const [claimTopics, countryRestrictions] = await Promise.all([
      this.repository.listClaimTopics(token.tokenUid),
      this.repository.listCountryRestrictions(token.tokenUid),
    ]);
    return {
      ...token,
      imageUrl: token.imageStorageKey ? '/api/v1/tokens/me/image' : null,
      claimTopics,
      countryRestrictions,
    };
  }

  async getOrCreate(user, organization, executor) {
    const existing = await this.repository.findByUserUid(user.userUid, executor);
    if (existing) return existing;
    return this.repository.createForOrganization(organization, user.userUid, {
      currentStep: 'tokenInformation',
      isDraft: true,
      status: 'draft',
    }, executor);
  }

  async saveInformation(user, input, imageFile) {
    const organization = await this.approvedOrganization(user);
    const current = await this.repository.findByUserUid(user.userUid);
    this.assertEditable(current);

    if (!input.isDraft) {
      requiredFields(input, [
        'tokenName', 'tokenSymbol', 'decimals', 'initialTokenPrice', 'treasuryWalletAddress',
      ], 'Token information');
      if (!imageFile && !current?.imageStorageKey) {
        throw ApiError.badRequest('Token information is incomplete.', [{
          field: 'tokenImage',
          message: 'tokenImage is required.',
        }]);
      }
    }

    let processedImage;
    if (imageFile) processedImage = await this.imageService.process(imageFile);
    const { isDraft, ...fields } = input;
    const update = {
      ...fields,
      ...(processedImage?.fields || {}),
      currentStep: isDraft ? (current?.currentStep || 'tokenInformation') : 'claims',
      isDraft: true,
      status: 'draft',
    };

    try {
      const token = current
        ? await this.repository.updateByUserUid(user.userUid, update)
        : await this.repository.createForOrganization(organization, user.userUid, update);
      if (processedImage && current?.imageStorageKey && current.imageStorageKey !== token.imageStorageKey) {
        this.imageService.remove(current.imageStorageKey).catch((error) => {
          logger.warn('Could not remove replaced token image', { tokenUid: token.tokenUid, error });
        });
      }
      return token;
    } catch (error) {
      if (processedImage) await fs.promises.unlink(processedImage.filePath).catch(() => {});
      throw error;
    }
  }

  async saveClaims(user, input) {
    const organization = await this.approvedOrganization(user);
    const current = await this.getOrCreate(user, organization);
    this.assertEditable(current);
    if (!input.isDraft && !input.claimTopicUids.length) {
      throw ApiError.badRequest('At least one claim topic is required.');
    }
    if (!input.isDraft && !input.organizationActsAsTrustedClaimIssuer) {
      throw ApiError.badRequest('The organization must act as the trusted claim issuer.');
    }
    const claimTopics = await this.optionRepository.findClaimTopics(input.claimTopicUids);
    if (claimTopics.length !== input.claimTopicUids.length) {
      throw ApiError.badRequest('One or more selected claim topics are invalid or inactive.');
    }

    return this.transactionRunner(async (connection) => {
      const selected = await this.repository.replaceClaimTopics(current.tokenUid, claimTopics, connection);
      const token = await this.repository.updateByUserUid(user.userUid, {
        trustedClaimIssuerWalletAddress: input.organizationActsAsTrustedClaimIssuer
          ? organization.walletAddress
          : null,
        currentStep: input.isDraft ? current.currentStep : 'compliance',
        isDraft: true,
        status: 'draft',
      }, connection);
      return { token, claimTopics: selected };
    });
  }

  async saveCompliance(user, input) {
    const organization = await this.approvedOrganization(user);
    const current = await this.getOrCreate(user, organization);
    this.assertEditable(current);
    if (!input.isDraft) {
      requiredFields(input, [
        'maxInvestors', 'maxBalancePerInvestor', 'countryRestrictionMode',
      ], 'Token compliance rules');
      if (!input.countryUids.length) {
        throw ApiError.badRequest('At least one country restriction is required.');
      }
    }
    const countries = await this.locationRepository.findCountries(input.countryUids);
    if (countries.length !== input.countryUids.length) {
      throw ApiError.badRequest('One or more selected restriction countries are invalid or inactive.');
    }
    if (countries.some((country) => !/^\d{3}$/.test(country.numericCode || ''))) {
      throw ApiError.badRequest('One or more selected countries are missing an ISO 3166-1 numeric code.');
    }

    return this.transactionRunner(async (connection) => {
      const restrictions = await this.repository.replaceCountryRestrictions(current.tokenUid, countries, connection);
      const token = await this.repository.updateByUserUid(user.userUid, {
        maxInvestors: input.maxInvestors,
        maxBalancePerInvestor: input.maxBalancePerInvestor,
        countryRestrictionMode: input.countryRestrictionMode,
        currentStep: input.isDraft ? current.currentStep : 'governance',
        isDraft: true,
        status: 'draft',
      }, connection);
      return { token, countryRestrictions: restrictions };
    });
  }

  validateOrganizationWallet(field, value, organizationWalletAddress, isDraft) {
    if (!value) {
      if (!isDraft) requiredFields({ [field]: value }, [field], 'Token governance roles');
      return;
    }
    if (!ethers.isAddress(value) || value.toLowerCase() !== organizationWalletAddress.toLowerCase()) {
      throw ApiError.badRequest(`${field} must match the approved organization walletAddress.`);
    }
  }

  async saveGovernance(user, input) {
    const organization = await this.approvedOrganization(user);
    const current = await this.getOrCreate(user, organization);
    this.assertEditable(current);
    this.validateOrganizationWallet(
      'tokenAgentWalletAddress',
      input.tokenAgentWalletAddress,
      organization.walletAddress,
      input.isDraft,
    );
    this.validateOrganizationWallet(
      'identityManagerWalletAddress',
      input.identityManagerWalletAddress,
      organization.walletAddress,
      input.isDraft,
    );
    return this.repository.updateByUserUid(user.userUid, {
      tokenAgentWalletAddress: input.tokenAgentWalletAddress,
      identityManagerWalletAddress: input.identityManagerWalletAddress,
      currentStep: input.isDraft ? current.currentStep : 'review',
      isDraft: true,
      status: 'draft',
    });
  }

  async submit(user, { transactionHash }) {
    const organization = await this.approvedOrganization(user);
    const token = await this.repository.findByUserUid(user.userUid);
    if (!token) throw ApiError.badRequest('Token form has not been started.');
    if (token.status === 'deployed') {
      throw ApiError.conflict('The token has already been deployed.');
    }
    requiredFields(token, [
      'tokenName', 'tokenSymbol', 'decimals', 'initialTokenPrice', 'treasuryWalletAddress',
      'imageStorageKey', 'trustedClaimIssuerWalletAddress', 'maxInvestors', 'maxBalancePerInvestor',
      'countryRestrictionMode', 'tokenAgentWalletAddress', 'identityManagerWalletAddress',
    ], 'Token form');

    for (const field of ['trustedClaimIssuerWalletAddress', 'tokenAgentWalletAddress', 'identityManagerWalletAddress']) {
      if (token[field].toLowerCase() !== organization.walletAddress.toLowerCase()) {
        throw ApiError.badRequest(`${field} must match the approved organization walletAddress.`);
      }
    }
    const [claimTopics, countryRestrictions] = await Promise.all([
      this.repository.listClaimTopics(token.tokenUid),
      this.repository.listCountryRestrictions(token.tokenUid),
    ]);
    if (!claimTopics.length) throw ApiError.badRequest('At least one active claim topic is required.');
    if (!countryRestrictions.length) throw ApiError.badRequest('At least one active country restriction is required.');
    if (!fs.existsSync(this.imageService.resolve(token.imageStorageKey))) {
      throw ApiError.badRequest('The optimized token image is no longer available.');
    }

    let deployment;
    try {
      deployment = await this.deploymentReceiptService.verify(transactionHash);
    } catch (error) {
      const reason = String(error.shortMessage || error.reason || error.message || 'Unknown receipt verification error.')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
      const message = `Token deployment verification failed: ${reason}`;
      const failedToken = await this.repository.updateDeploymentByUserUid(user.userUid, {
        platformAgentWallet: ethers.isAddress(error.platformAgentWallet) ? error.platformAgentWallet : null,
        tokenAddress: null,
        identityRegistryAddress: null,
        identityRegistryStorageAddress: null,
        trustedIssuersRegistryAddress: null,
        claimTopicsRegistryAddress: null,
        modularComplianceAddress: null,
        deployTxHash: error.deployTxHash || transactionHash,
        deployedAtBlock: null,
        contractAddress: null,
        contractTxnHash: error.deployTxHash || transactionHash,
        contractTxnMessage: message,
        deployedAt: null,
        currentStep: 'review',
        isDraft: false,
        status: 'deploymentFailed',
      });
      if (!failedToken) {
        throw ApiError.conflict('The token deployment status changed while the transaction was being verified.');
      }
      logger.warn('Token deployment receipt verification failed', {
        tokenUid: token.tokenUid,
        transactionHash,
        reason,
      });
      throw new ApiError(422, message, {
        status: failedToken.status,
        deployTxHash: failedToken.deployTxHash,
        contractTxnMessage: failedToken.contractTxnMessage,
      }, 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED');
    }

    const contractTxnMessage = `TREX suite deployment verified successfully in block ${deployment.deployedAtBlock}.`;
    const deployedToken = await this.repository.updateDeploymentByUserUid(user.userUid, {
      ...deployment,
      contractAddress: deployment.tokenAddress,
      contractTxnHash: deployment.deployTxHash,
      contractTxnMessage,
      currentStep: 'deployed',
      isDraft: false,
      status: 'deployed',
    });
    if (!deployedToken) {
      throw ApiError.conflict('The token deployment status changed while the transaction was being verified.');
    }
    return deployedToken;
  }

  async getImage(user) {
    await this.approvedOrganization(user);
    const token = await this.repository.findByUserUid(user.userUid);
    if (!token?.imageStorageKey) throw ApiError.notFound('Token image was not found.');
    const filePath = this.imageService.resolve(token.imageStorageKey);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('Token image was not found.');
    return { token, filePath };
  }
}

module.exports = { TokenService, requiredFields };
