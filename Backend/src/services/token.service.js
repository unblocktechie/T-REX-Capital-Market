const fs = require('node:fs');
const ethers = require('ethers');
const { env } = require('../core/config/env');
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

// Deployment eligibility field set. Shared by the final submit endpoint and the
// deployment-attempt creation endpoint so the rules live in exactly one place.
const DEPLOYMENT_REQUIRED_FIELDS = [
  'tokenName', 'tokenSymbol', 'decimals', 'initialTokenPrice', 'treasuryWalletAddress',
  'imageStorageKey', 'trustedClaimIssuerWalletAddress', 'maxInvestors', 'maxBalancePerInvestor',
  'countryRestrictionMode', 'tokenAgentWalletAddress', 'identityManagerWalletAddress',
];

const ORGANIZATION_WALLET_FIELDS = [
  'trustedClaimIssuerWalletAddress', 'identityManagerWalletAddress',
];

const RPC_ERROR_CODES = new Set([
  'SERVER_ERROR', 'NETWORK_ERROR', 'TIMEOUT', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN',
]);

// The transaction was broadcast but a usable receipt is not yet available. This is
// a "keep waiting" signal, never a failure.
const isPendingReceiptError = (error) => {
  const message = String(error?.message || '');
  return error?.pending === true
    || error?.code === 'TRANSACTION_NOT_CONFIRMED'
    || /was not confirmed before the verification timeout|receipt is not yet available|still awaiting confirmation/i.test(message);
};

// The RPC endpoint itself is unreachable. Do not mark the transaction failed.
const isRpcUnavailableError = (error) => {
  if (RPC_ERROR_CODES.has(error?.code)) return true;
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network error|could not detect network|failed to fetch|rpc (?:error|unavailable)/i
    .test(String(error?.message || ''));
};

class TokenService {
  constructor({
    repository,
    organizationRepository,
    optionRepository,
    locationRepository,
    imageService,
    deploymentReceiptService,
    attemptRepository,
    config = env.blockchain,
    transactionRunner = withTransaction,
  }) {
    this.repository = repository;
    this.organizationRepository = organizationRepository;
    this.optionRepository = optionRepository;
    this.locationRepository = locationRepository;
    this.imageService = imageService;
    this.deploymentReceiptService = deploymentReceiptService;
    this.attemptRepository = attemptRepository;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  platformControllerAddress() {
    const address = this.config?.platformControllerAddress;
    if (!address || !ethers.isAddress(address)) {
      throw new ApiError(
        500,
        'The Platform Controller Token Agent is not configured correctly.',
        undefined,
        'PLATFORM_CONTROLLER_NOT_CONFIGURED',
      );
    }
    return ethers.getAddress(address);
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
    if (token && ['readyToDeploy', 'deploymentPending', 'deployed'].includes(token.status)) {
      throw ApiError.conflict(`Token cannot be edited while its status is ${token.status}.`);
    }
  }

  // Reusable pre-deployment eligibility gate. Verifies every configuration field,
  // that issuer-managed governance wallets equal the approved organization wallet, that the
  // Token Agent stored when this token was created is valid, that at least one claim
  // topic exists, that allowlists are not empty, and that the optimized image is still
  // present. An empty blocklist intentionally means no country is restricted. Returns
  // the loaded claim topics and country restrictions.
  async assertTokenReadyForDeployment(token, organization) {
    requiredFields(token, DEPLOYMENT_REQUIRED_FIELDS, 'Token form');
    for (const field of ORGANIZATION_WALLET_FIELDS) {
      if (String(token[field]).toLowerCase() !== organization.walletAddress.toLowerCase()) {
        throw ApiError.badRequest(`${field} must match the approved organization walletAddress.`);
      }
    }
    if (!ethers.isAddress(token.tokenAgentWalletAddress)) {
      throw ApiError.badRequest('tokenAgentWalletAddress must be a valid Platform Controller address.');
    }
    const [claimTopics, countryRestrictions] = await Promise.all([
      this.repository.listClaimTopics(token.tokenUid),
      this.repository.listCountryRestrictions(token.tokenUid),
    ]);
    if (!claimTopics.length) throw ApiError.badRequest('At least one active claim topic is required.');
    if (token.countryRestrictionMode === 'allowlist' && !countryRestrictions.length) {
      throw ApiError.badRequest('At least one active country is required when using an allowlist.');
    }
    if (!fs.existsSync(this.imageService.resolve(token.imageStorageKey))) {
      throw ApiError.badRequest('The optimized token image is no longer available.');
    }
    return { claimTopics, countryRestrictions };
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
      tokenAgentWalletAddress: this.platformControllerAddress(),
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
      // Never accept the Token Agent from client state. New rows receive the current default,
      // while a token created under an earlier Platform Controller keeps its stored agent.
      tokenAgentWalletAddress: current
        ? current.tokenAgentWalletAddress
        : this.platformControllerAddress(),
      ...(fields.initialTokenPrice !== undefined
        ? { currentTokenPrice: fields.initialTokenPrice }
        : {}),
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

  async updateCurrentPrice(user, input) {
    const organization = await this.approvedOrganization(user);
    const token = await this.repository.findByUserUid(user.userUid);
    if (!token || token.organizationUid !== organization.organizationUid) {
      throw new ApiError(404, 'Owned token was not found.', undefined, 'TOKEN_NOT_FOUND');
    }
    if (token.status !== 'deployed' || !token.isActive) {
      throw new ApiError(409, 'Only an active deployed token price can be changed.', undefined, 'TOKEN_NOT_DEPLOYED');
    }
    const updated = await this.repository.updateCurrentPriceByOwner(
      user.userUid,
      token.tokenUid,
      input.currentTokenPrice,
    );
    if (!updated) {
      throw new ApiError(409, 'Token price changed concurrently or the token is no longer active.', undefined, 'TOKEN_PRICE_UPDATE_CONFLICT');
    }
    return updated;
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
    // The frontend omits these fields when the issuer selects no restricted
    // countries. Normalize that state to an empty blocklist (allow every country).
    const countryRestrictionMode = input.countryRestrictionMode || 'blocklist';
    const countryUids = Array.isArray(input.countryUids) ? input.countryUids : [];
    if (!input.isDraft) {
      requiredFields({ ...input, countryRestrictionMode }, [
        'maxInvestors', 'maxBalancePerInvestor', 'countryRestrictionMode',
      ], 'Token compliance rules');
      if (countryRestrictionMode === 'allowlist' && !countryUids.length) {
        throw ApiError.badRequest('At least one country is required when using an allowlist.');
      }
    }
    const countries = await this.locationRepository.findCountries(countryUids);
    if (countries.length !== countryUids.length) {
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
        countryRestrictionMode,
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
      'identityManagerWalletAddress',
      input.identityManagerWalletAddress,
      organization.walletAddress,
      input.isDraft,
    );
    return this.repository.updateByUserUid(user.userUid, {
      // `tokenAgentWalletAddress` in a legacy frontend payload is intentionally ignored.
      // Preserve the backend-owned value assigned when this token row was first created.
      tokenAgentWalletAddress: current.tokenAgentWalletAddress,
      identityManagerWalletAddress: input.identityManagerWalletAddress,
      currentStep: input.isDraft ? current.currentStep : 'review',
      isDraft: true,
      status: 'draft',
    });
  }

  // Final submit. Backward compatible: accepts { transactionHash } alone (legacy),
  // or { transactionHash, deploymentAttemptUid } for the two-phase flow. Returns
  // either the finalized token, or a { pending: true, ... } marker for the 202 path.
  async submit(user, { transactionHash, deploymentAttemptUid }) {
    const organization = await this.approvedOrganization(user);
    const token = await this.repository.findByUserUid(user.userUid);
    if (!token) throw ApiError.badRequest('Token form has not been started.');
    const normalizedHash = String(transactionHash).toLowerCase();

    // Idempotent short-circuit: an already-deployed token with the same hash succeeds.
    if (token.status === 'deployed') {
      if (token.deployTxHash && token.deployTxHash.toLowerCase() === normalizedHash) return token;
      throw ApiError.conflict('The token has already been deployed.');
    }

    // Resolve/validate the deployment attempt (explicit uid, or auto-link legacy by hash).
    let deploymentAttempt = null;
    if (deploymentAttemptUid) {
      if (!this.attemptRepository) throw ApiError.badRequest('Deployment attempts are not available in this environment.');
      deploymentAttempt = await this.attemptRepository.findByUid(deploymentAttemptUid);
      if (!deploymentAttempt) throw ApiError.notFound('Deployment attempt was not found.');
      if (
        deploymentAttempt.userUid !== user.userUid
        || deploymentAttempt.tokenUid !== token.tokenUid
        || deploymentAttempt.organizationUid !== token.organizationUid
      ) {
        throw ApiError.forbidden('The deployment attempt does not belong to this token.');
      }
      if (deploymentAttempt.transactionHash
        && deploymentAttempt.transactionHash.toLowerCase() !== normalizedHash) {
        throw new ApiError(409, 'The submitted transaction hash does not match the deployment attempt.', {
          deploymentAttemptUid: deploymentAttempt.deploymentAttemptUid,
          transactionHash: deploymentAttempt.transactionHash,
        }, 'TRANSACTION_HASH_CONFLICT');
      }
      if (!['submitted', 'confirming', 'confirmed'].includes(deploymentAttempt.status)) {
        throw new ApiError(409, 'The deployment attempt is not in a verifiable state.', {
          deploymentAttemptUid: deploymentAttempt.deploymentAttemptUid,
          status: deploymentAttempt.status,
        }, 'DEPLOYMENT_ATTEMPT_NOT_VERIFIABLE');
      }
      if (deploymentAttempt.status === 'confirmed' && token.status === 'deployed') return token;
    } else if (this.attemptRepository) {
      deploymentAttempt = await this.attemptRepository.findByTokenAndHash(token.tokenUid, normalizedHash);
    }

    await this.assertTokenReadyForDeployment(token, organization);

    // A broadcast hash already tied to a different token is a hard conflict.
    if (this.repository.findByDeployTxHashExcept) {
      const hashOwner = await this.repository.findByDeployTxHashExcept(normalizedHash, token.tokenUid);
      if (hashOwner) {
        throw new ApiError(409, 'This transaction hash is already linked to another token.', {
          transactionHash: normalizedHash,
        }, 'TRANSACTION_HASH_CONFLICT');
      }
    }

    // Fast, non-blocking confirmation pre-check (when the receipt service supports it):
    // return 202/confirming instead of blocking on a long wait or failing prematurely.
    if (typeof this.deploymentReceiptService.checkConfirmation === 'function') {
      let confirmation;
      try {
        confirmation = await this.deploymentReceiptService.checkConfirmation(normalizedHash);
      } catch (error) {
        // Treat a pre-check RPC problem as "keep waiting", never as a failure.
        confirmation = { ready: false };
        logger.warn('Deployment confirmation pre-check could not reach the RPC provider', {
          tokenUid: token.tokenUid, error,
        });
      }
      if (!confirmation.ready) {
        return this.markConfirming(deploymentAttempt, normalizedHash);
      }
    }

    let deployment;
    try {
      deployment = await this.deploymentReceiptService.verify(normalizedHash);
    } catch (error) {
      if (isPendingReceiptError(error)) return this.markConfirming(deploymentAttempt, normalizedHash);
      if (isRpcUnavailableError(error)) {
        throw new ApiError(503, 'The blockchain RPC provider is temporarily unavailable. Please retry shortly.', undefined, 'RPC_UNAVAILABLE');
      }
      return this.recordVerificationFailure(user, token, deploymentAttempt, error, normalizedHash);
    }

    // The verified contract address must not already belong to another token.
    if (this.repository.findByTokenAddressExcept) {
      const addressOwner = await this.repository.findByTokenAddressExcept(deployment.tokenAddress, token.tokenUid);
      if (addressOwner) {
        throw new ApiError(409, 'The deployed contract address is already assigned to another token.', {
          contractAddress: deployment.tokenAddress,
        }, 'CONTRACT_ADDRESS_CONFLICT');
      }
    }

    // Sender must equal the wallet the attempt was authorized for (attempt flow only,
    // to preserve behavior of legacy submits that never carried an attempt).
    if (deploymentAttempt
      && deployment.platformAgentWallet
      && deployment.platformAgentWallet.toLowerCase() !== String(deploymentAttempt.walletAddress).toLowerCase()) {
      await this.attemptRepository.update(deploymentAttempt.deploymentAttemptUid, {
        status: 'failed',
        errorCode: 'INVALID_DEPLOYER_WALLET',
        errorMessage: 'Transaction sender does not match the authorized deployment wallet.',
        failedAt: new Date(),
      });
      throw new ApiError(403, 'The deployment transaction sender does not match the authorized deployment wallet.', {
        deploymentAttemptUid: deploymentAttempt.deploymentAttemptUid,
      }, 'INVALID_DEPLOYER_WALLET');
    }

    const contractTxnMessage = `TREX suite deployment verified successfully in block ${deployment.deployedAtBlock}.`;
    const finalizeFields = {
      ...deployment,
      contractAddress: deployment.tokenAddress,
      contractTxnHash: deployment.deployTxHash,
      contractTxnMessage,
      currentStep: 'deployed',
      isDraft: false,
      status: 'deployed',
    };

    // Attempt flow: finalize token + attempt atomically under row locks.
    if (deploymentAttempt && this.attemptRepository) {
      return this.transactionRunner(async (connection) => {
        if (this.repository.findForUpdateByUserUid) {
          const locked = await this.repository.findForUpdateByUserUid(user.userUid, connection);
          if (locked && locked.status === 'deployed') {
            return this.repository.findByUserUid(user.userUid, connection);
          }
        }
        const deployedToken = await this.repository.updateDeploymentByUserUid(user.userUid, finalizeFields, connection);
        if (!deployedToken) {
          const current = await this.repository.findByUserUid(user.userUid, connection);
          if (current && current.status === 'deployed') return current;
          throw ApiError.conflict('The token deployment status changed while the transaction was being verified.');
        }
        await this.attemptRepository.update(deploymentAttempt.deploymentAttemptUid, {
          status: 'confirmed',
          transactionHash: normalizedHash,
          contractAddress: deployment.tokenAddress,
          blockNumber: deployment.deployedAtBlock,
          confirmedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        }, connection);
        return deployedToken;
      });
    }

    // Legacy single-call finalize (unchanged behavior).
    const deployedToken = await this.repository.updateDeploymentByUserUid(user.userUid, finalizeFields);
    if (!deployedToken) {
      throw ApiError.conflict('The token deployment status changed while the transaction was being verified.');
    }
    return deployedToken;
  }

  async markConfirming(deploymentAttempt, transactionHash) {
    if (deploymentAttempt && this.attemptRepository && deploymentAttempt.status !== 'confirming') {
      await this.attemptRepository.update(deploymentAttempt.deploymentAttemptUid, { status: 'confirming' });
    }
    return {
      pending: true,
      deploymentAttemptUid: deploymentAttempt?.deploymentAttemptUid || null,
      status: 'confirming',
      transactionHash,
    };
  }

  async recordVerificationFailure(user, token, deploymentAttempt, error, transactionHash) {
    const reason = String(error.shortMessage || error.reason || error.message || 'Unknown receipt verification error.')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
    const message = `Token deployment verification failed: ${reason}`;
    const failureFields = {
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
    };
    const failedToken = await this.repository.updateDeploymentByUserUid(user.userUid, failureFields);
    if (deploymentAttempt && this.attemptRepository) {
      await this.attemptRepository.update(deploymentAttempt.deploymentAttemptUid, {
        status: 'failed',
        errorCode: 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED',
        errorMessage: reason.slice(0, 1000),
        failedAt: new Date(),
      });
    }
    if (!failedToken) {
      throw ApiError.conflict('The token deployment status changed while the transaction was being verified.');
    }
    logger.warn('Token deployment receipt verification failed', {
      tokenUid: token.tokenUid, transactionHash, reason,
    });
    throw new ApiError(422, message, {
      status: failedToken.status,
      deployTxHash: failedToken.deployTxHash,
      contractTxnMessage: failedToken.contractTxnMessage,
    }, 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED');
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

module.exports = { TokenService, requiredFields, DEPLOYMENT_REQUIRED_FIELDS };
