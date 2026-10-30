const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');

class OrganizationAdminService {
  constructor(repository, identityService, transactionRunner = withTransaction, dependencies = {}) {
    this.repository = repository;
    this.identityService = identityService;
    this.transactionRunner = transactionRunner;
    this.chainRuntimeService = dependencies.chainRuntimeService || null;
    this.userChainIdentityService = dependencies.userChainIdentityService || null;
  }

  listApplications(query) {
    return this.repository.listSubmittedApplications(query);
  }

  async getApplication(organizationUid) {
    const organization = await this.repository.findByOrganizationUid(organizationUid);
    if (!organization || !organization.submittedAt || organization.status === 'draft') {
      throw ApiError.notFound('Submitted organization application was not found.');
    }
    const [beneficialOwners, documents] = await Promise.all([
      this.repository.listBeneficialOwners(organizationUid),
      this.repository.listDocuments(organizationUid),
    ]);
    return { ...organization, beneficialOwners, documents };
  }

  async getDocumentFile(organizationUid, documentUid) {
    const organization = await this.repository.findByOrganizationUid(organizationUid);
    if (!organization || !organization.submittedAt || organization.status === 'draft') {
      throw ApiError.notFound('Submitted organization application was not found.');
    }
    const document = await this.repository.findDocument(organizationUid, documentUid);
    if (!document) throw ApiError.notFound('Organization document was not found.');

    const uploadDirectory = path.resolve(env.uploads.directory);
    const filePath = path.resolve(uploadDirectory, document.storageKey);
    if (!filePath.startsWith(`${uploadDirectory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw ApiError.notFound('The organization document file is no longer available.');
    }
    return { document, filePath };
  }

  async reviewApplication(organizationUid, input) {
    if (input.status !== 'approved') {
      return this.transactionRunner(async (connection) => {
        const organization = await this.reviewableApplication(organizationUid, connection);
        const rejectionCount = Number(organization.rejectionCount || 0) + 1;
        const canResubmit = rejectionCount === 1;
        return this.repository.updateByOrganizationUid(organizationUid, {
          status: 'rejected',
          currentStep: canResubmit ? 'companyInformation' : 'completed',
          isDraft: false,
          rejectionReason: input.rejectionReason,
          rejectionCount,
          canResubmit,
          isUserNotified: false,
        }, connection);
      });
    }

    // Only hold the organization row lock while inspecting/updating database state.
    // Blockchain confirmation can take seconds or minutes and must never run inside
    // this transaction: UserChainIdentityService synchronizes the same organization
    // through another connection, which would otherwise wait on our own row lock.
    const organization = await this.transactionRunner(
      (connection) => this.reviewableApplication(organizationUid, connection),
    );

    let contractResult;
    let approvalChain = null;
    try {
      approvalChain = this.chainRuntimeService
        ? (organization.onboardingChainUid
          ? await this.chainRuntimeService.byUid(organization.onboardingChainUid)
          : await this.chainRuntimeService.default())
        : null;
      contractResult = this.userChainIdentityService && approvalChain
        ? await this.userChainIdentityService.createOrGet({
          user: { userUid: organization.userUid, roleName: 'Issuer' },
          chainUid: approvalChain.chainUid,
          walletAddress: organization.walletAddress,
          sourceUid: organization.organizationUid,
        })
        : await this.identityService.createOrganizationIdentity(
          organization.walletAddress,
          `org-${organization.organizationUid}`,
        );
    } catch (error) {
      const contractTxnMessage = this.contractFailureMessage(error);
      await this.transactionRunner(async (connection) => {
        const current = await this.repository.findForReview(organizationUid, connection);
        if (current && this.isReviewable(current)) {
          await this.repository.updateByOrganizationUid(organizationUid, {
            contractTxnHash: error.transactionHash || null,
            contractTxnMessage,
          }, connection);
        }
      });
      throw new ApiError(
        502,
        contractTxnMessage,
        { contractTxnMessage },
        'ORGANIZATION_IDENTITY_CREATION_FAILED',
      );
    }

    const transactionHash = contractResult.creationTxHash || contractResult.txHash || null;
    const contractTxnMessage = contractResult.alreadyExisted || !transactionHash
      ? 'On-chain organization identity already existed; application approved successfully.'
      : 'On-chain organization identity created; application approved successfully.';

    return this.transactionRunner(async (connection) => {
      const current = await this.repository.findForReview(organizationUid, connection);
      if (!current) throw ApiError.notFound('Organization application was not found.');
      // A concurrent approval can finish while this request waits for the chain.
      // Return that authoritative result instead of overwriting it or reporting failure.
      if (current.status === 'approved') return current;
      if (!this.isReviewable(current)) {
        throw ApiError.conflict('The organization application changed while approval was in progress.');
      }
      return this.repository.updateByOrganizationUid(organizationUid, {
        status: 'approved',
        currentStep: 'completed',
        isDraft: false,
        rejectionReason: null,
        canResubmit: false,
        isUserNotified: false,
        onboardingChainUid: approvalChain?.chainUid || current.onboardingChainUid,
        contractAddress: contractResult.identityAddress,
        contractTxnHash: transactionHash,
        contractTxnMessage,
      }, connection);
    });
  }

  isReviewable(organization) {
    return ['submitted', 'resubmitted', 'underReview'].includes(organization.status);
  }

  async reviewableApplication(organizationUid, connection) {
    const organization = await this.repository.findForReview(organizationUid, connection);
    if (!organization) throw ApiError.notFound('Organization application was not found.');
    if (!this.isReviewable(organization)) {
      throw ApiError.conflict('Only a submitted or resubmitted organization application can be reviewed.');
    }
    return organization;
  }

  contractFailureMessage(error) {
    const rawMessage = error.shortMessage || error.reason || error.message || 'Unknown blockchain error.';
    let safeMessage = String(rawMessage);
    const secrets = [env.blockchain.deployerPrivateKey, env.blockchain.sepoliaRpcUrl].filter(Boolean);
    for (const secret of secrets) safeMessage = safeMessage.split(secret).join('[REDACTED]');
    return `On-chain organization identity creation failed: ${safeMessage}`.slice(0, 2000);
  }
}

module.exports = { OrganizationAdminService };
