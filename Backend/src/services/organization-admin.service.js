const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');

class OrganizationAdminService {
  constructor(repository, identityService, transactionRunner = withTransaction) {
    this.repository = repository;
    this.identityService = identityService;
    this.transactionRunner = transactionRunner;
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
    const reviewResult = await this.transactionRunner(async (connection) => {
      const organization = await this.repository.findForReview(organizationUid, connection);
      if (!organization) throw ApiError.notFound('Organization application was not found.');
      if (!['submitted', 'resubmitted', 'underReview'].includes(organization.status)) {
        throw ApiError.conflict('Only a submitted or resubmitted organization application can be reviewed.');
      }

      if (input.status === 'approved') {
        let contractResult;
        try {
          contractResult = await this.identityService.createOrganizationIdentity(
            organization.walletAddress,
            `org-${organization.organizationUid}`,
          );
        } catch (error) {
          const contractTxnMessage = this.contractFailureMessage(error);
          const updatedOrganization = await this.repository.updateByOrganizationUid(organizationUid, {
            contractTxnHash: error.transactionHash || null,
            contractTxnMessage,
          }, connection);
          return {
            organization: updatedOrganization,
            contractFailed: true,
            contractTxnMessage,
          };
        }
        const contractTxnMessage = contractResult.alreadyExisted
          ? 'On-chain organization identity already existed; application approved successfully.'
          : 'On-chain organization identity created; application approved successfully.';
        const updatedOrganization = await this.repository.updateByOrganizationUid(organizationUid, {
          status: 'approved',
          currentStep: 'completed',
          isDraft: false,
          rejectionReason: null,
          canResubmit: false,
          isUserNotified: false,
          contractAddress: contractResult.identityAddress,
          contractTxnHash: contractResult.txHash,
          contractTxnMessage,
        }, connection);
        return { organization: updatedOrganization, contractFailed: false };
      }

      const rejectionCount = Number(organization.rejectionCount || 0) + 1;
      const canResubmit = rejectionCount === 1;
      const updatedOrganization = await this.repository.updateByOrganizationUid(organizationUid, {
        status: 'rejected',
        currentStep: canResubmit ? 'companyInformation' : 'completed',
        isDraft: false,
        rejectionReason: input.rejectionReason,
        rejectionCount,
        canResubmit,
        isUserNotified: false,
      }, connection);
      return { organization: updatedOrganization, contractFailed: false };
    });

    if (reviewResult.contractFailed) {
      throw new ApiError(
        502,
        reviewResult.contractTxnMessage,
        { contractTxnMessage: reviewResult.contractTxnMessage },
        'ORGANIZATION_IDENTITY_CREATION_FAILED',
      );
    }
    return reviewResult.organization;
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
