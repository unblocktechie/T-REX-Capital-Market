const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');
const { investmentInvitationEmail } = require('./common/email-template.service');
const { logger } = require('./common/log.service');

const EMAIL_CLAIM_TTL_MS = 5 * 60 * 1000;

class InvestorInvitationService {
  constructor({ repository, investorRepository, investmentService, emailService, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.investorRepository = investorRepository;
    this.investmentService = investmentService;
    this.emailService = emailService;
    this.transactionRunner = transactionRunner;
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') throw ApiError.forbidden('This action is available only to issuer accounts.');
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') throw ApiError.forbidden('This action is available only to investor accounts.');
  }

  async loadIssuerToken(user, tokenUid) {
    this.assertIssuer(user);
    const token = await this.repository.findIssuerTokenContext(user.userUid, tokenUid);
    if (!token) throw new ApiError(404, 'Token was not found for this issuer.', undefined, 'ISSUER_TOKEN_NOT_FOUND');
    if (token.organizationStatus !== 'approved' || !token.organizationActive) {
      throw new ApiError(409, 'The issuer organization must be approved and active before inviting investors.', undefined, 'ISSUER_ORGANIZATION_NOT_ACTIVE');
    }
    if (token.status !== 'deployed') {
      throw new ApiError(409, 'Only investors for a deployed token can be invited.', undefined, 'TOKEN_NOT_DEPLOYED');
    }
    return token;
  }

  countryEligibility(token, investor) {
    if (!investor.countryUid || !investor.countryNumericCode) {
      return { eligible: false, code: 'INVESTOR_COUNTRY_INVALID', message: 'Investor verified country is unavailable.' };
    }
    if (token.countryRestrictionMode === 'allowlist' && !investor.countryListed) {
      return { eligible: false, code: 'INVESTOR_COUNTRY_NOT_ELIGIBLE', message: 'Investor country is not permitted by this token.' };
    }
    if (token.countryRestrictionMode === 'blocklist' && investor.countryListed) {
      return { eligible: false, code: 'INVESTOR_COUNTRY_NOT_ELIGIBLE', message: 'Investor country is restricted for this token.' };
    }
    return { eligible: true, code: null, message: null };
  }

  presentInvestor(row, token) {
    const country = this.countryEligibility(token, row);
    const alreadyInterested = Boolean(row.interestUid);
    const delivered = row.emailStatus === 'SENT';
    let reason = country.message;
    if (alreadyInterested) reason = 'Investor already has an investment interest for this token.';
    else if (delivered) reason = 'Invitation has already been sent.';
    return {
      investorUid: row.investorUid,
      userUid: row.userUid,
      fullName: row.fullName,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      accreditationType: row.accreditationType,
      address: {
        streetAddress: row.streetAddress,
        countryUid: row.countryUid,
        countryName: row.countryName,
        countryCode: row.countryCode,
        countryNumericCode: row.countryNumericCode,
        stateUid: row.stateUid,
        stateName: row.stateName,
        cityUid: row.cityUid,
        cityName: row.cityName,
      },
      compliance: {
        sourceOfWealth: row.sourceOfWealth,
        estimatedNetWorth: row.estimatedNetWorth,
        annualInvestmentCapacity: row.annualInvestmentCapacity,
        yearsOfExperience: row.yearsOfExperience,
        previousRwaExperience: row.previousRwaExperience,
        rwaExperienceDescription: row.rwaExperienceDescription,
        accreditationType: row.accreditationType,
      },
      walletAddress: row.walletAddress,
      onchainIdentityAddress: row.onchainIdentityAddress,
      profileReference: row.profileReference,
      onchainIdReference: row.onchainIdReference,
      profileStatus: row.profileStatus,
      submittedAt: row.submittedAt,
      invitation: row.invitationUid ? {
        invitationUid: row.invitationUid,
        status: row.invitationStatus,
        emailStatus: row.emailStatus,
        sentAt: row.sentAt,
        viewedAt: row.viewedAt,
      } : null,
      investmentInterest: row.interestUid ? { interestUid: row.interestUid, status: row.interestStatus } : null,
      eligibleForInvitation: country.eligible && !alreadyInterested && !delivered,
      invitationEligibilityCode: alreadyInterested ? 'INVESTMENT_INTEREST_ALREADY_EXISTS'
        : (delivered ? 'INVITATION_ALREADY_SENT' : country.code),
      invitationEligibilityMessage: reason || null,
    };
  }

  async listIssuerInvestors(user, query) {
    const token = await this.loadIssuerToken(user, query.tokenUid);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { rows, total } = await this.repository.listCompletedInvestors({
      organizationUid: token.organizationUid,
      tokenUid: token.tokenUid,
      search: query.search || '',
      invitationStatus: query.invitationStatus || 'all',
      page,
      limit,
    });
    return {
      items: rows.map((row) => this.presentInvestor(row, token)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      token: {
        tokenUid: token.tokenUid,
        tokenName: token.tokenName,
        tokenSymbol: token.tokenSymbol,
        status: token.status,
      },
    };
  }

  isProcessingFresh(row) {
    if (row.emailStatus !== 'PROCESSING' || !row.emailClaimedAt) return false;
    return Date.now() - new Date(row.emailClaimedAt).getTime() < EMAIL_CLAIM_TTL_MS;
  }

  presentIssuerInvitation(row) {
    return {
      invitationUid: row.invitationUid,
      organizationUid: row.organizationUid,
      tokenUid: row.tokenUid,
      investorUid: row.investorUid,
      status: row.status,
      emailStatus: row.emailStatus,
      emailAttempts: Number(row.emailAttempts || 0),
      sentAt: row.sentAt || null,
      viewedAt: row.viewedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async invite(user, investorUid, { tokenUid }) {
    const token = await this.loadIssuerToken(user, tokenUid);
    const investor = await this.repository.findCompletedInvestor(investorUid, tokenUid);
    if (!investor) {
      throw new ApiError(404, 'Completed investor profile was not found.', undefined, 'INVESTOR_PROFILE_NOT_FOUND');
    }
    if (!investor.email) throw new ApiError(409, 'Investor email address is unavailable.', undefined, 'INVESTOR_EMAIL_UNAVAILABLE');
    const country = this.countryEligibility(token, investor);
    if (!country.eligible) throw new ApiError(409, country.message, undefined, country.code);
    const interest = await this.repository.findActiveInterest(tokenUid, investorUid);
    if (interest) {
      throw new ApiError(409, 'Investor already has an investment interest for this token.', undefined, 'INVESTMENT_INTEREST_ALREADY_EXISTS');
    }

    const claimed = await this.transactionRunner(async (connection) => {
      const result = await this.repository.createOrFindForUpdate({
        organizationUid: token.organizationUid,
        tokenUid,
        issuerUserUid: user.userUid,
        investorUid,
        investorUserUid: investor.userUid,
      }, connection);
      const row = result.row;
      if (row.emailStatus === 'SENT' || row.status === 'SENT' || row.status === 'VIEWED') {
        return { row, shouldSend: false, duplicate: true };
      }
      if (this.isProcessingFresh(row)) return { row, shouldSend: false, duplicate: true, processing: true };
      return { row: await this.repository.claimEmail(row.invitationUid, connection), shouldSend: true, duplicate: !result.created };
    });

    if (!claimed.shouldSend) {
      return {
        invitation: this.presentIssuerInvitation(claimed.row),
        emailSent: claimed.row.emailStatus === 'SENT',
        alreadyExisted: true,
        processing: Boolean(claimed.processing),
      };
    }

    const marketplaceUrl = `${env.frontendUrl.replace(/\/$/, '')}/app/marketplace/${encodeURIComponent(tokenUid)}`;
    const template = investmentInvitationEmail({
      investorName: investor.fullName || `${investor.firstName || ''} ${investor.lastName || ''}`.trim(),
      issuerName: token.issuerFullName,
      companyName: token.legalCompanyName,
      tokenName: token.tokenName,
      tokenSymbol: token.tokenSymbol,
      marketplaceUrl,
    });
    try {
      const sent = await this.emailService.sendEmail({ to: investor.email, ...template });
      const updated = await this.repository.markEmailSent(claimed.row.invitationUid, sent.messageId);
      return {
        invitation: this.presentIssuerInvitation(updated),
        emailSent: true,
        alreadyExisted: claimed.duplicate,
        processing: false,
      };
    } catch (error) {
      await this.repository.markEmailFailed(claimed.row.invitationUid, error.message);
      logger.error('Investor invitation email delivery failed', {
        invitationUid: claimed.row.invitationUid,
        tokenUid,
        investorUid,
        error: error.message,
      });
      throw new ApiError(502, 'Invitation was saved, but the email could not be delivered. Retry the invitation.', undefined, 'INVITATION_EMAIL_FAILED');
    }
  }

  async requireInvestorProfile(user) {
    this.assertInvestor(user);
    const investor = await this.investorRepository.findByUserUid(user.userUid);
    if (!investor || investor.status !== 'submitted' || !investor.isActive) {
      throw new ApiError(409, 'Complete your investor profile before viewing invitations.', undefined, 'INVESTOR_PROFILE_INCOMPLETE');
    }
    return investor;
  }

  issuerView(row) {
    return {
      organizationUid: row.organizationUid,
      legalCompanyName: row.legalCompanyName,
      issuerFullName: row.issuerFullName,
      walletAddress: row.organizationWalletAddress,
      website: row.organizationWebsite,
      countryName: row.organizationCountryName,
      countryCode: row.organizationCountryCode,
    };
  }

  invitationView(row, token) {
    return {
      invitationUid: row.invitationUid,
      status: row.status,
      sentAt: row.sentAt,
      viewedAt: row.viewedAt || null,
      createdAt: row.createdAt,
      issuer: this.issuerView(row),
      token,
      marketplaceUrl: `${env.frontendUrl.replace(/\/$/, '')}/app/marketplace/${encodeURIComponent(row.tokenUid)}`,
    };
  }

  async tokenDetailsByUid(tokenUid) {
    return this.investmentService.getTokenDetails(tokenUid);
  }

  async listInvestorInvitations(user, query) {
    const investor = await this.requireInvestorProfile(user);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { rows, total } = await this.repository.listForInvestor(investor.investorUid, {
      search: query.search || '', status: query.status || 'all', page, limit,
    });
    const tokens = new Map();
    await Promise.all([...new Set(rows.map((row) => row.tokenUid))].map(async (tokenUid) => {
      tokens.set(tokenUid, await this.tokenDetailsByUid(tokenUid));
    }));
    return {
      items: rows.map((row) => this.invitationView(row, tokens.get(row.tokenUid))),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getInvestorInvitation(user, invitationUid) {
    const investor = await this.requireInvestorProfile(user);
    const row = await this.repository.findForInvestor(invitationUid, investor.investorUid);
    if (!row) throw new ApiError(404, 'Invitation was not found.', undefined, 'INVITATION_NOT_FOUND');
    return this.invitationView(row, await this.tokenDetailsByUid(row.tokenUid));
  }

  async viewInvestorInvitation(user, invitationUid) {
    const investor = await this.requireInvestorProfile(user);
    const current = await this.repository.findForInvestor(invitationUid, investor.investorUid);
    if (!current) throw new ApiError(404, 'Invitation was not found.', undefined, 'INVITATION_NOT_FOUND');
    const row = await this.repository.markViewed(invitationUid, investor.investorUid);
    return this.invitationView(row, await this.tokenDetailsByUid(row.tokenUid));
  }
}

module.exports = { InvestorInvitationService, EMAIL_CLAIM_TTL_MS };
