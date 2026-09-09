const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { logger } = require('./common/log.service');

// Subscription (interest) statuses in which issuer claim signing is allowed. Signing acts ON a
// submitted interest; a fully-successful signing is what advances it to 'verifiedByIssuer'
// (so 'verifiedByIssuer' is included to allow idempotent re-signing after success).
const SIGNABLE_INTEREST_STATUSES = ['submitIntrest', 'verifiedByIssuer'];

class IssuerClaimService {
  constructor({
    repository,
    interestRepository,
    organizationRepository,
    tokenRepository,
    claimSignatureService,
  }) {
    this.repository = repository;
    this.interestRepository = interestRepository;
    this.organizationRepository = organizationRepository;
    this.tokenRepository = tokenRepository;
    this.claimSignatureService = claimSignatureService;
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') {
      throw ApiError.forbidden('Issuer claim signing is available only to issuer accounts.');
    }
  }

  // Loads the subscription (interest), asserts it belongs to the authenticated issuer's
  // organization, and returns the trusted server-side context for verification. Every trusted
  // value (issuer wallet, investor identity, required topics) is derived here from the DB —
  // never from the request body.
  async loadContext(user, subscriptionId) {
    this.assertIssuer(user);
    const organization = await this.organizationRepository.findByUserUid(user.userUid);
    if (!organization) throw ApiError.badRequest('No organization is associated with this issuer account.');

    const interest = await this.interestRepository.findInterestByUid(subscriptionId);
    if (!interest || interest.organizationUid !== organization.organizationUid) {
      throw ApiError.notFound('Subscription was not found.');
    }
    const expectedIssuerWallet = organization.walletAddress;
    const investorIdentityAddress = interest.investorIdentityAddress;

    const requiredTopicRows = await this.tokenRepository.listClaimTopics(interest.tokenUid);
    const requiredTopics = requiredTopicRows
      .map((row) => Number(row.value))
      .filter((value) => Number.isInteger(value));

    return { organization, interest, expectedIssuerWallet, investorIdentityAddress, requiredTopics };
  }

  // POST /issuer/claims/sign
  async signClaims(user, { subscriptionId, claims }) {
    const { interest, expectedIssuerWallet, investorIdentityAddress, requiredTopics } = await this.loadContext(user, subscriptionId);

    if (!SIGNABLE_INTEREST_STATUSES.includes(interest.status)) {
      throw ApiError.conflict('Issuer claim signing is not allowed for this subscription in its current state.');
    }
    if (!expectedIssuerWallet || !ethers.isAddress(expectedIssuerWallet)) {
      throw ApiError.badRequest('The organization does not have a valid issuer wallet address.');
    }
    if (!investorIdentityAddress || !ethers.isAddress(investorIdentityAddress)) {
      throw ApiError.badRequest('The investor does not have an on-chain identity address yet.');
    }

    const requiredSet = new Set(requiredTopics);
    const requiredCount = requiredTopics.length;
    if (!requiredCount) throw ApiError.badRequest('The token has no required claim topics configured.');

    // Validate the submitted claims against the server-derived required topics.
    const seen = new Set();
    for (const claim of claims) {
      if (!requiredSet.has(claim.claimTopic)) {
        throw ApiError.badRequest(`Claim topic ${claim.claimTopic} is not required by this token.`);
      }
      if (seen.has(claim.claimTopic)) {
        throw ApiError.badRequest(`Duplicate claim topic ${claim.claimTopic} in the request.`);
      }
      seen.add(claim.claimTopic);
    }

    // Idempotent completion: once a verification is SIGNED, further submits return it unchanged.
    const alreadySigned = await this.repository.findLatestVerificationByStatus(interest.interestUid, 'SIGNED');
    if (alreadySigned) {
      const signatures = await this.repository.listSignatures(alreadySigned.verificationUid);
      return this.present(alreadySigned, subscriptionId, signatures);
    }

    // New attempt — never overwrite previous attempts (full audit trail).
    const attemptNumber = (await this.repository.getMaxAttempt(interest.interestUid)) + 1;
    const verification = await this.repository.createVerification({
      interestUid: interest.interestUid,
      tokenUid: interest.tokenUid,
      organizationUid: interest.organizationUid,
      investorUid: interest.investorUid,
      status: 'PENDING',
      requiredClaimCount: requiredCount,
      verifiedClaimCount: 0,
      requiredClaimTopics: requiredTopics.join(','),
      attemptNumber,
    });

    // Cryptographically verify each submitted claim. The signer is recovered from the signature
    // and compared to the registered issuer wallet — nothing is trusted from the request.
    for (const claim of claims) {
      let status = 'VERIFICATION_FAILED';
      let signedByWallet = null;
      let verificationError = null;
      let verifiedAt = null;
      try {
        const result = this.claimSignatureService.verifyClaimSignature({
          investorIdentityAddress,
          expectedIssuerWallet,
          claimTopic: claim.claimTopic,
          data: claim.data,
          signature: claim.signature,
        });
        signedByWallet = result.signedByWallet;
        if (result.valid) {
          status = 'SIGNED';
          verifiedAt = new Date();
        } else {
          verificationError = 'Recovered signer does not match the registered issuer wallet.';
        }
      } catch (error) {
        status = 'VERIFICATION_FAILED';
        verificationError = `Signature verification failed: ${String(error.shortMessage || error.message || error).slice(0, 500)}`;
      }
      await this.repository.upsertSignature({
        verificationUid: verification.verificationUid,
        interestUid: interest.interestUid,
        claimTopic: claim.claimTopic,
        data: claim.data,
        signature: claim.signature,
        signedByWallet,
        status,
        verificationError,
        verifiedAt,
      });
    }

    // Overall status is derived from the stored individual results — the source of truth.
    const signatures = await this.repository.listSignatures(verification.verificationUid);
    const verifiedClaimCount = signatures.filter((s) => s.status === 'SIGNED' && requiredSet.has(Number(s.claimTopic))).length;
    const overall = this.deriveOverallStatus(signatures, requiredCount, verifiedClaimCount);

    const updated = await this.repository.updateVerification(verification.verificationUid, {
      status: overall,
      verifiedClaimCount,
      completedAt: overall === 'SIGNED' ? new Date() : null,
    });

    // The subscription (interest) advances to 'verifiedByIssuer' ONLY when the overall
    // verification is SIGNED (every required claim topic has a valid issuer signature). On any
    // VERIFICATION_FAILED / PENDING / NETWORK_ERROR result the interest status is left unchanged
    // (it stays submitIntrest) — a failed signing attempt never advances the subscription.
    if (overall === 'SIGNED') {
      await this.interestRepository.updateInterestByUid(interest.interestUid, {
        status: 'verifiedByIssuer',
        decisionAt: new Date(),
      });
      // Record the status change on the interest timeline so it shows in the history.
      await this.recordVerifiedByIssuer(user, interest);
    }
    return this.present(updated, subscriptionId, signatures);
  }

  // Appends a 'verifiedByIssuer' event to the interest timeline. Best-effort — a history-write
  // failure must never break the signing flow.
  async recordVerifiedByIssuer(user, interest) {
    if (typeof this.interestRepository.createHistory !== 'function') return;
    try {
      await this.interestRepository.createHistory({
        interestUid: interest.interestUid,
        tokenUid: interest.tokenUid,
        organizationUid: interest.organizationUid,
        investorUid: interest.investorUid,
        eventType: 'verifiedByIssuer',
        actorRole: 'issuer',
        actorUserUid: user.userUid,
        note: 'All required claim topics were cryptographically verified.',
      });
    } catch (error) {
      logger.warn('Could not record verifiedByIssuer history event', { interestUid: interest.interestUid, error });
    }
  }

  // SIGNED only when 100% of required topics are verified. Otherwise a hard failure dominates a
  // (retryable) network error, which dominates PENDING (partial, nothing failed yet).
  deriveOverallStatus(signatures, requiredCount, verifiedClaimCount) {
    if (verifiedClaimCount === requiredCount) return 'SIGNED';
    if (signatures.some((s) => s.status === 'VERIFICATION_FAILED')) return 'VERIFICATION_FAILED';
    if (signatures.some((s) => s.status === 'NETWORK_ERROR')) return 'NETWORK_ERROR';
    return 'PENDING';
  }

  // GET /issuer/claims/:subscriptionId — the current (latest) verification attempt.
  async getStatus(user, subscriptionId) {
    const { interest, requiredTopics } = await this.loadContext(user, subscriptionId);
    const verification = await this.repository.findLatestVerification(interest.interestUid);
    if (!verification) {
      return {
        verificationId: null,
        subscriptionId,
        status: 'PENDING',
        attemptNumber: 0,
        requiredClaimCount: requiredTopics.length,
        verifiedClaimCount: 0,
        claims: [],
      };
    }
    const signatures = await this.repository.listSignatures(verification.verificationUid);
    return this.present(verification, subscriptionId, signatures);
  }

  present(verification, subscriptionId, signatures) {
    return {
      verificationId: verification.verificationUid,
      subscriptionId,
      status: verification.status,
      attemptNumber: verification.attemptNumber,
      requiredClaimCount: verification.requiredClaimCount,
      verifiedClaimCount: verification.verifiedClaimCount,
      completedAt: verification.completedAt || null,
      claims: signatures.map((s) => ({
        claimTopic: Number(s.claimTopic),
        status: s.status,
        signedByWallet: s.signedByWallet || null,
        verificationError: s.verificationError || null,
      })),
    };
  }
}

module.exports = { IssuerClaimService, SIGNABLE_INTEREST_STATUSES };
