const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { logger } = require('./common/log.service');

// Interest states in which the investor may submit on-chain claims. Signing/verification must
// already have advanced the subscription to verifiedByIssuer; claimSubmitted is included so
// re-submits after completion are handled idempotently.
const SUBMITTABLE_INTEREST_STATUSES = ['verifiedByIssuer', 'claimSubmitted'];

// Verifier error code -> HTTP status. Everything else is a 422 verification failure.
const ERROR_STATUS = {
  INVALID_TX_HASH: 400,
  TRANSACTION_NOT_FOUND: 404,
  INSUFFICIENT_CONFIRMATIONS: 409,
  RPC_UNAVAILABLE: 503,
};

class InvestorClaimService {
  constructor({
    repository,
    interestRepository,
    issuerClaimRepository,
    investorRepository,
    tokenRepository,
    verifier,
    recoveryService = null,
    claimStateService = null,
    claimIndexerService = null,
    transactionRunner = withTransaction,
  }) {
    this.repository = repository;
    this.interestRepository = interestRepository;
    this.issuerClaimRepository = issuerClaimRepository;
    this.investorRepository = investorRepository;
    this.tokenRepository = tokenRepository;
    this.verifier = verifier;
    // Shared targeted reconciliation (same rules as the fallback runner) for the Retry endpoint.
    this.recoveryService = recoveryService;
    this.claimStateService = claimStateService;
    this.claimIndexerService = claimIndexerService;
    this.transactionRunner = transactionRunner;
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') {
      throw ApiError.forbidden('This action is available only to investor accounts.');
    }
  }

  // Loads the subscription (interest) and asserts it belongs to the authenticated investor. The
  // investor is resolved from the session, never trusted from the request body.
  async loadOwnedInterest(user, interestId) {
    this.assertInvestor(user);
    const investor = await this.investorRepository.findByUserUid(user.userUid);
    if (!investor) throw ApiError.badRequest('Complete your investor onboarding first.');
    const interest = await this.interestRepository.findInterestByUid(interestId);
    if (!interest || interest.investorUid !== investor.investorUid) {
      throw ApiError.notFound('Subscription was not found.');
    }
    return { investor, interest };
  }

  async requiredTopics(interest) {
    const rows = await this.tokenRepository.listClaimTopics(interest.tokenUid);
    return rows.map((row) => Number(row.value)).filter((value) => Number.isInteger(value));
  }

  // GET /investor/claims?interestId= — the issuer-signed claims the investor must submit on-chain,
  // plus the trusted investor + issuer identity addresses (derived from the DB).
  async getClaims(user, interestId) {
    const { interest } = await this.loadOwnedInterest(user, interestId);
    const investorIdentityAddress = interest.investorIdentityAddress || null;
    const issuerIdentityAddress = interest.organizationIdentityAddress || null;

    const verification = await this.issuerClaimRepository.findLatestVerificationByStatus(interest.interestUid, 'SIGNED');
    if (!verification) {
      return { interestId, investorIdentityAddress, issuerIdentityAddress, claims: [] };
    }
    const [signatures, submissions] = await Promise.all([
      this.issuerClaimRepository.listSignatures(verification.verificationUid),
      this.repository.listByInterest(interest.interestUid),
    ]);
    const submissionBySignature = new Map(submissions.map((s) => [s.claimSignatureUid, s]));

    const claims = signatures
      .filter((s) => s.status === 'SIGNED')
      .map((s) => {
        const submission = submissionBySignature.get(s.signatureUid);
        return {
          claimId: s.signatureUid,
          claimTopic: Number(s.claimTopic),
          data: s.data,
          signature: s.signature,
        // The submission status when an on-chain submission has been started; 'notInitiated' when
        // no investorClaimSubmission row exists yet (the investor hasn't started the transaction).
          status: submission?.status || 'notInitiated',
          syncStatus: submission?.syncStatus || null,
          txHash: submission?.txHash || null,
        };
      });
    return { interestId, investorIdentityAddress, issuerIdentityAddress, claims };
  }

  // Shared validation for both phases (prepare + submit). Loads the subscription, enforces
  // ownership + state, and loads the expected claim from the DB (never trusting the client).
  async loadValidatedClaim(user, claimId, interestId) {
    const { investor, interest } = await this.loadOwnedInterest(user, interestId);
    if (!SUBMITTABLE_INTEREST_STATUSES.includes(interest.status)) {
      throw ApiError.conflict('Claims can be submitted only after the issuer has verified this subscription.');
    }
    const investorIdentityAddress = interest.investorIdentityAddress;
    const issuerIdentityAddress = interest.organizationIdentityAddress;
    if (!investorIdentityAddress || !ethers.isAddress(investorIdentityAddress)) {
      throw new ApiError(422, 'The investor does not have a valid registered ONCHAINID.', undefined, 'INVALID_INVESTOR_IDENTITY');
    }
    if (!issuerIdentityAddress || !ethers.isAddress(issuerIdentityAddress)) {
      throw ApiError.badRequest('The issuer organization does not have a registered on-chain identity.');
    }
    const claim = await this.issuerClaimRepository.findSignatureByUid(claimId);
    if (!claim) throw new ApiError(404, 'Claim was not found.', undefined, 'CLAIM_NOT_FOUND');
    if (claim.interestUid !== interest.interestUid) {
      throw new ApiError(422, 'Claim does not belong to this application.', undefined, 'CLAIM_NOT_ASSOCIATED_WITH_APPLICATION');
    }
    if (claim.status !== 'SIGNED') {
      throw new ApiError(422, 'The issuer signature for this claim has not been verified.', undefined, 'ISSUER_SIGNATURE_NOT_VERIFIED');
    }
    const required = await this.requiredTopics(interest);
    if (!new Set(required).has(Number(claim.claimTopic))) {
      throw new ApiError(422, 'This claim topic is not required by the token.', undefined, 'CLAIM_MISMATCH');
    }
    return { investor, interest, claim, required, investorIdentityAddress, issuerIdentityAddress };
  }

  buildBase({ investor, interest, claim, investorIdentityAddress, issuerIdentityAddress }) {
    return {
      interestUid: interest.interestUid,
      claimSignatureUid: claim.signatureUid,
      investorUid: investor.investorUid,
      tokenUid: interest.tokenUid,
      organizationUid: interest.organizationUid,
      claimTopic: Number(claim.claimTopic),
      data: claim.data,
      signature: claim.signature,
      investorIdentityAddress,
      issuerIdentityAddress,
    };
  }

  // Phase 1 — POST /investor/claims/:claimId/prepare. Records a PENDING submission and returns
  // the exact on-chain parameters the frontend needs to build the MetaMask transaction (mirrors
  // the token-deployment "create attempt" step). No blockchain call happens here.
  async prepareClaim(user, claimId, { interestId }) {
    const ctx = await this.loadValidatedClaim(user, claimId, interestId);
    const { claim, interest, investorIdentityAddress, issuerIdentityAddress } = ctx;

    const existing = await this.repository.findByInterestAndSignature(interest.interestUid, claim.signatureUid);
    const claimParams = {
      claimId: claim.signatureUid,
      claimTopic: Number(claim.claimTopic),
      data: claim.data,
      signature: claim.signature,
      investorIdentityAddress,
      issuerIdentityAddress,
    };
    if (existing && existing.status === 'CONFIRMED') {
      return { ...claimParams, submissionUid: existing.submissionUid, status: 'CONFIRMED', alreadyConfirmed: true };
    }

    // Capture a narrow recovery starting point. RPC trouble must not block preparation; legacy
    // lookback recovery remains available when the block number cannot be read.
    let preparedAtBlock = null;
    if (this.claimStateService) {
      try {
        preparedAtBlock = await this.claimStateService.getLatestBlockNumber();
      } catch (error) {
        logger.warn('Could not capture claim preparation block; fallback lookback will be used', {
          interestUid: interest.interestUid, claimId, error: error.message,
        });
      }
    }

    // Create or reset the record to PENDING for this attempt (clears any prior tx / failure).
    const submission = await this.repository.upsert(this.buildBase(ctx), {
      status: 'PENDING',
      preparedAtBlock,
      lastScannedBlock: null,
      txHash: null,
      blockNumber: null,
      transactionIndex: null,
      logIndex: null,
      failureReason: null,
      syncStatus: 'IDLE',
      syncRequestedAt: null,
      syncStartedAt: null,
      syncCompletedAt: null,
      syncAttempts: 0,
      syncFailureReason: null,
      nextSyncAt: new Date(Date.now() + 30000),
      confirmedAt: null,
      submittedAt: new Date(),
    });
    return { ...claimParams, submissionUid: submission.submissionUid, status: 'PENDING', alreadyConfirmed: false };
  }

  // Fast hybrid retry. It never performs a historical getLogs scan in the HTTP request:
  //   - known txHash -> direct receipt verification;
  //   - missing txHash -> one Identity.getClaim state read;
  //   - exact state exists -> reconcile a stored indexed event or queue targeted recovery.
  async retryClaim(user, claimId, { interestId }) {
    const ctx = await this.loadValidatedClaim(user, claimId, interestId);
    const { interest, claim, required } = ctx;

    const submission = await this.repository.findByInterestAndSignature(interest.interestUid, claim.signatureUid);
    if (!submission) {
      throw new ApiError(404, 'Prepare this claim submission before retrying it.', undefined, 'CLAIM_SUBMISSION_NOT_PREPARED');
    }
    if (submission && submission.status === 'CONFIRMED') {
      return this.presentRetry('CONFIRMED', true, interest, claim, submission, required, 'This claim has already been confirmed.');
    }

    if (submission.txHash) {
      try {
        const verified = await this.verifier.verifyClaimSubmission({
          txHash: submission.txHash,
          investorIdentityAddress: ctx.investorIdentityAddress,
          issuerIdentityAddress: ctx.issuerIdentityAddress,
          claimTopic: Number(claim.claimTopic),
          data: claim.data,
          signature: claim.signature,
        });
        return this.confirmExistingSubmission(user, ctx, submission, submission.txHash, verified, 'Claim transaction verified during retry.');
      } catch (error) {
        if (error.code === 'TRANSACTION_NOT_FOUND' || error.code === 'INSUFFICIENT_CONFIRMATIONS') {
          return this.presentRetry(
            'PENDING_CONFIRMATION', false, interest, claim, submission, required,
            'The claim transaction is not mined yet. Retry after it receives a confirmation.',
          );
        }
        if (error.transient || error.code === 'RPC_UNAVAILABLE') throw this.toApiError(error);
        // A stored frontend hash can be stale or wrong. The Identity state remains authoritative,
        // so continue to the fast state lookup before requiring another wallet transaction.
      }
    }

    if (!this.claimStateService) {
      throw new ApiError(503, 'On-chain claim state lookup is unavailable.', undefined, 'RPC_UNAVAILABLE');
    }
    let state;
    try {
      state = await this.claimStateService.inspectClaim({
        investorIdentityAddress: ctx.investorIdentityAddress,
        issuerIdentityAddress: ctx.issuerIdentityAddress,
        claimTopic: Number(claim.claimTopic),
        data: claim.data,
        signature: claim.signature,
      });
    } catch (error) {
      throw new ApiError(503, 'The blockchain provider is temporarily unavailable. Please retry shortly.', undefined, 'RPC_UNAVAILABLE');
    }
    if (!state.exists || !state.matches) {
      await this.repository.finishSynchronization(submission.submissionUid, {
        syncStatus: 'IDLE', failureReason: null, nextRetrySeconds: null,
      });
      return this.presentRetry(
        'TRANSACTION_REQUIRED', false, interest, claim, submission, required,
        'No matching on-chain claim exists. A new wallet transaction is required.',
      );
    }

    if (this.claimIndexerService) {
      const indexed = await this.claimIndexerService.reconcileSubmissionFromStoredEvent(submission);
      if (indexed && indexed.status === 'CONFIRMED') {
        const freshInterest = await this.interestRepository.findInterestByUid(interest.interestUid);
        return this.presentRetry('CONFIRMED', true, freshInterest || interest, claim, indexed, required, 'Claim submitted and confirmed.');
      }
    }

    const queued = await this.repository.queueSynchronization(submission.submissionUid);
    return this.presentRetry(
      'SYNCING', true, interest, claim, queued || submission, required,
      'The claim exists on-chain. Claim synchronization has started.',
    );
  }

  async presentRetry(status, detected, interest, claim, submission, required, message) {
    const confirmedTopics = await this.repository.listConfirmedTopics(interest.interestUid);
    const confirmedClaims = required.filter((topic) => confirmedTopics.includes(topic)).length;
    const totalRequiredClaims = required.length;
    return {
      status,
      detected,
      message,
      claim: {
        claimId: claim.signatureUid,
        claimTopic: Number(claim.claimTopic),
        status: submission ? submission.status : 'PENDING',
        txHash: submission ? submission.txHash || null : null,
        confirmedAt: submission ? submission.confirmedAt || null : null,
      },
      application: {
        interestId: interest.interestUid,
        status: interest.status,
        totalRequiredClaims,
        confirmedClaims,
        pendingClaims: Math.max(0, totalRequiredClaims - confirmedClaims),
      },
    };
  }

  async confirmExistingSubmission(user, ctx, submission, txHash, verified, historyNote) {
    const { investor, interest, claim, required } = ctx;
    const outcome = await this.transactionRunner(async (connection) => {
      const locked = await this.interestRepository.findInterestForUpdate(interest.interestUid, connection);
      const updated = await this.repository.confirmFromEvent(submission.submissionUid, {
        txHash,
        blockNumber: verified.blockNumber,
        transactionIndex: verified.transactionIndex,
        logIndex: verified.logIndex,
      }, connection);
      const confirmedSubmission = await this.repository.findByUid(submission.submissionUid, connection);
      if (!updated && (!confirmedSubmission || confirmedSubmission.status !== 'CONFIRMED')) {
        throw ApiError.conflict('Claim submission changed while it was being confirmed. Retry the request.');
      }

      const confirmedTopics = await this.repository.listConfirmedTopics(interest.interestUid, connection);
      const allConfirmed = required.every((topic) => confirmedTopics.includes(topic));
      let status = locked ? locked.status : interest.status;
      if (allConfirmed && status === 'verifiedByIssuer') {
        const transitioned = await this.interestRepository.transitionInterestStatus(
          interest.interestUid, 'verifiedByIssuer', 'claimSubmitted', connection,
        );
        if (transitioned) {
          status = 'claimSubmitted';
          if (typeof this.interestRepository.createHistory === 'function') {
            await this.interestRepository.createHistory({
              interestUid: interest.interestUid,
              tokenUid: interest.tokenUid,
              organizationUid: interest.organizationUid,
              investorUid: investor.investorUid,
              eventType: 'claimSubmitted',
              actorRole: 'investor',
              actorUserUid: user.userUid,
              note: historyNote || 'All required investor claims successfully submitted and verified on-chain.',
            }, connection);
          }
        } else if (locked && locked.status === 'claimSubmitted') {
          status = 'claimSubmitted';
        }
      }
      return { submission: confirmedSubmission, confirmedTopics, status };
    });

    return this.present(
      { ...interest, status: outcome.status }, claim, outcome.submission, required,
      'Claim verified on-chain and confirmed.', outcome.confirmedTopics, 'CONFIRMED',
    );
  }

  toApiError(error) {
    const status = ERROR_STATUS[error.code] || 422;
    return new ApiError(status, error.message || 'Claim verification failed.', undefined, error.code || 'CLAIM_VERIFICATION_FAILED');
  }

  // POST /investor/claims/:claimId/submit — verify the on-chain claim submission and, when all
  // required claims are confirmed, advance the subscription to claimSubmitted.
  async submitClaim(user, claimId, { interestId, txHash }) {
    const ctx = await this.loadValidatedClaim(user, claimId, interestId);
    const { investor, interest, claim, required, investorIdentityAddress, issuerIdentityAddress } = ctx;

    // Idempotency: an already-confirmed claim returns success without re-verifying.
    const existing = await this.repository.findByInterestAndSignature(interest.interestUid, claimId);
    if (existing && existing.status === 'CONFIRMED') {
      return this.present(interest, claim, existing, required, 'This claim has already been confirmed.');
    }

    const base = this.buildBase(ctx);

    // Persist the wallet-provided hash before any RPC call. If this process crashes or the RPC is
    // unavailable, Retry can still use the authoritative receipt path instead of scanning logs.
    const activeSubmission = await this.repository.upsert(base, {
      status: 'PENDING',
      txHash,
      failureReason: null,
      syncStatus: 'IDLE',
      syncFailureReason: null,
      nextSyncAt: null,
      submittedAt: (existing && existing.submittedAt) || new Date(),
    });

    // Independent on-chain verification (no DB locks held during network I/O).
    let verified;
    try {
      verified = await this.verifier.verifyClaimSubmission({
        txHash,
        investorIdentityAddress,
        issuerIdentityAddress,
        claimTopic: Number(claim.claimTopic),
        data: claim.data,
        signature: claim.signature,
      });
    } catch (error) {
      if (!error.code) throw error;
      if (error.code === 'TRANSACTION_NOT_FOUND' || error.code === 'INSUFFICIENT_CONFIRMATIONS') {
        return this.present(
          interest, claim, activeSubmission, required,
          'Claim transaction recorded and awaiting blockchain confirmation.', undefined, 'PENDING_CONFIRMATION',
        );
      }
      if (error.transient) {
        // Retryable infrastructure problem: the hash is already durably recorded as PENDING.
        throw this.toApiError(error);
      }
      // Definitive failure — record FAILED with the reason, then surface the error.
      await this.repository.update(activeSubmission.submissionUid, {
        status: 'FAILED', txHash, failureReason: error.code, confirmedAt: null,
      }).catch((dbError) => {
        logger.warn('Could not record failed claim submission', { interestUid: interest.interestUid, dbError });
      });
      throw this.toApiError(error);
    }

    return this.confirmExistingSubmission(
      user, ctx, activeSubmission, txHash, verified,
      'All required investor claims successfully submitted and verified on-chain.',
    );
  }

  present(interest, claim, submission, required, message, confirmedTopicsOverride, workflowStatus = 'CONFIRMED') {
    const confirmed = confirmedTopicsOverride
      ? confirmedTopicsOverride.filter((topic) => required.includes(topic)).length
      : undefined;
    const confirmedClaims = confirmed !== undefined ? confirmed : (submission?.status === 'CONFIRMED' ? 1 : 0);
    const totalRequiredClaims = required.length;
    return {
      status: workflowStatus,
      message,
      claim: {
        claimId: claim.signatureUid,
        claimTopic: Number(claim.claimTopic),
        status: submission ? submission.status : 'PENDING',
        txHash: submission ? submission.txHash : null,
        confirmedAt: submission ? submission.confirmedAt || null : null,
      },
      application: {
        interestId: interest.interestUid,
        status: interest.status,
        totalRequiredClaims,
        confirmedClaims,
        pendingClaims: Math.max(0, totalRequiredClaims - confirmedClaims),
      },
    };
  }
}

module.exports = { InvestorClaimService, SUBMITTABLE_INTEREST_STATUSES };
