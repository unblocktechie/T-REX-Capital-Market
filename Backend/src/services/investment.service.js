const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { logger } = require('./common/log.service');

const IMAGE_URL = (tokenUid) => `/api/v1/investments/tokens/${tokenUid}/image`;

// Shapes a raw marketplace token row for the API, adding the image URL and country
// restrictions, and dropping the storage key (an internal detail the client never needs).
const presentToken = (row, countryRestrictions = []) => {
  if (!row) return row;
  const { imageStorageKey, imageMimeType, ...rest } = row;
  return {
    ...rest,
    hasImage: Boolean(imageStorageKey),
    imageUrl: imageStorageKey ? IMAGE_URL(row.tokenUid) : null,
    countryRestrictions: countryRestrictions.map((restriction) => ({
      countryUid: restriction.countryUid,
      countryCode: restriction.countryCode,
      countryName: restriction.countryName,
      numericCode: restriction.numericCode,
    })),
  };
};

class InvestmentService {
  constructor({
    repository,
    tokenRepository,
    investorRepository,
    organizationRepository,
    tokenImageService,
    issuerClaimRepository = null,
    investorUploadsDir = env.investorUploads.directory,
  }) {
    this.repository = repository;
    this.tokenRepository = tokenRepository;
    this.investorRepository = investorRepository;
    this.organizationRepository = organizationRepository;
    this.tokenImageService = tokenImageService;
    // Used by approveInterest to require a SIGNED issuer claim verification before promoting.
    this.issuerClaimRepository = issuerClaimRepository;
    this.investorUploadsDir = investorUploadsDir;
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') {
      throw ApiError.forbidden('This action is available only to investor accounts.');
    }
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') {
      throw ApiError.forbidden('This action is available only to issuer accounts.');
    }
  }

  // -------------------------------------------------------------- marketplace

  async listTokens(user, query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    // Investors may only ever see deployed tokens; the status filter is ignored for them.
    // Admins may filter by any token status (or 'all').
    const status = user.roleName === 'Investor' ? 'deployed' : (query.status || 'deployed');
    const { rows, total } = await this.repository.listMarketplaceTokens({
      search: query.search,
      status,
      page,
      limit,
    });

    const restrictionsByToken = await this.groupCountryRestrictions(rows.map((row) => row.tokenUid));
    return {
      items: rows.map((row) => presentToken(row, restrictionsByToken.get(row.tokenUid) || [])),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // Loads country restrictions for a set of tokens and groups them by tokenUid.
  async groupCountryRestrictions(tokenUids) {
    const grouped = new Map();
    if (!tokenUids.length) return grouped;
    const rows = await this.repository.listCountryRestrictionsForTokens(tokenUids);
    for (const row of rows) {
      if (!grouped.has(row.tokenUid)) grouped.set(row.tokenUid, []);
      grouped.get(row.tokenUid).push(row);
    }
    return grouped;
  }

  async getTokenDetails(tokenUid) {
    const token = await this.repository.findMarketplaceTokenByUid(tokenUid);
    if (!token) throw ApiError.notFound('Token was not found.');
    const [requiredClaimTopics, countryRestrictions] = await Promise.all([
      this.tokenRepository.listClaimTopics(tokenUid),
      this.repository.listCountryRestrictionsForTokens([tokenUid]),
    ]);
    return { ...presentToken(token, countryRestrictions), requiredClaimTopics };
  }

  // Role-agnostic (admin + investor): serves the optimized token image file.
  async getTokenImageFile(tokenUid) {
    const token = await this.repository.findTokenImageByUid(tokenUid);
    if (!token?.imageStorageKey) throw ApiError.notFound('Token image was not found.');
    const filePath = this.tokenImageService.resolve(token.imageStorageKey);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('Token image was not found.');
    return { token, filePath };
  }

  // ------------------------------------------------------- eligibility helper

  // Compares the claim topics an issuer required on a token against the claim topics the
  // investor holds documents for. Returns the per-topic breakdown (with the investor's
  // matching documents, and `missing` / `rejected` flags) plus an overall `eligible` flag and
  // the list of missing topics. `rejectedSet` carries the claim-topic codes the issuer rejected.
  buildEligibility(requiredClaimTopics, investorDocuments, rejectedSet = new Set()) {
    const requiredClaimTopicsView = requiredClaimTopics.map((topic) => {
      const documents = investorDocuments.filter((doc) => doc.claimTopicCode === topic.claimTopicCode);
      const satisfied = documents.length > 0;
      return {
        claimTopicUid: topic.claimTopicUid,
        claimTopicCode: topic.claimTopicCode,
        claimTopicName: topic.claimTopicName,
        value: topic.value,
        satisfied,
        missing: !satisfied,
        rejected: rejectedSet.has(topic.claimTopicCode),
        documents: documents.map((doc) => ({
          documentUid: doc.documentUid,
          documentTypeUid: doc.documentTypeUid,
          documentTypeName: doc.documentTypeName,
          documentCategory: doc.documentCategory,
          claimTopicCode: doc.claimTopicCode,
          originalFileName: doc.originalFileName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          createdAt: doc.createdAt,
        })),
      };
    });
    const missingClaimTopics = requiredClaimTopicsView.filter((topic) => topic.missing);
    return {
      eligible: missingClaimTopics.length === 0,
      requiredClaimTopics: requiredClaimTopicsView,
      missingClaimTopics: missingClaimTopics.map((topic) => ({
        claimTopicCode: topic.claimTopicCode,
        claimTopicName: topic.claimTopicName,
      })),
    };
  }

  // Appends a timeline event for an interest. Best-effort: a history-write failure must never
  // break the underlying submit / reject / resubmission flow.
  async recordHistory(ids, event) {
    try {
      await this.repository.createHistory({
        interestUid: ids.interestUid,
        tokenUid: ids.tokenUid,
        organizationUid: ids.organizationUid,
        investorUid: ids.investorUid,
        ...event,
      });
    } catch (error) {
      logger.warn('Could not record investment interest history', { interestUid: ids.interestUid, event: event.eventType, error });
    }
  }

  // Records a submission event (submitted / resubmitted) AND snapshots the investor's current
  // document versions into investmentSubmissionDocument, linked to that timeline event. The
  // snapshot pins the exact versions submitted so a later profile re-upload can never change
  // what this application shows. Best-effort so it never breaks the submit flow.
  async recordSubmission(ids, { eventType, actorUserUid, resubmitAttempt = null, rejectedClaim = null }) {
    try {
      const historyUid = await this.repository.createHistory({
        interestUid: ids.interestUid,
        tokenUid: ids.tokenUid,
        organizationUid: ids.organizationUid,
        investorUid: ids.investorUid,
        eventType,
        resubmitAttempt,
        rejectedClaim,
        actorRole: 'investor',
        actorUserUid,
      });
      const submissionNumber = (await this.repository.getMaxSubmissionNumber(ids.interestUid)) + 1;
      const documents = await this.investorRepository.listCurrentDocumentsForSnapshot(ids.investorUid);
      for (const doc of documents) {
        await this.repository.createSubmissionDocument({
          historyUid,
          interestUid: ids.interestUid,
          tokenUid: ids.tokenUid,
          organizationUid: ids.organizationUid,
          investorUid: ids.investorUid,
          submissionNumber,
          documentUid: doc.documentUid,
          documentTypeUid: doc.documentTypeUid,
          documentTypeName: doc.documentTypeName,
          documentCategory: doc.documentCategory,
          claimTopicCode: doc.claimTopicCode,
          versionNumber: doc.versionNumber,
          originalFileName: doc.originalFileName,
          storageKey: doc.storageKey,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
        });
      }
    } catch (error) {
      logger.warn('Could not record investment submission snapshot', { interestUid: ids.interestUid, eventType, error });
    }
  }

  // Rejection / resubmission summary derived from the interest row + its timeline. This is what
  // gives both the issuer and the investor visibility into how many times a request was
  // rejected / resubmitted and how many resubmissions remain.
  buildHistorySummary(interest, timeline) {
    const rejectedCount = Number(interest.rejectedCount);
    const canResubmitClaim = Number(interest.canResubmitClaim);
    return {
      status: interest.status,
      rejectReasonType: interest.rejectReasonType || null,
      rejectReason: interest.rejectReason || null,
      currentRejectedClaim: [...this.rejectedClaimSet(interest)],
      rejectedCount,
      canResubmitClaim,
      resubmitRemaining: Math.max(0, rejectedCount - canResubmitClaim),
      canResubmit: interest.status === 'rejected'
        && interest.rejectReasonType === 'DOC_REJECTED'
        && canResubmitClaim < rejectedCount,
      timesRejected: timeline.filter((event) => event.eventType === 'rejected').length,
      timesResubmitted: timeline.filter((event) => event.eventType === 'resubmitted').length,
    };
  }

  // Shapes a timeline into the API response. Each submitted/resubmitted event carries the exact
  // document versions that were snapshotted for that submission (with a role-appropriate
  // download URL), so both sides see the documents attached at each point in time.
  async assembleHistory(interest, downloadUrlFor) {
    const [timeline, submissionDocs] = await Promise.all([
      this.repository.listHistoryByInterest(interest.interestUid),
      this.repository.listSubmissionDocumentsByInterest(interest.interestUid),
    ]);
    const docsByHistory = new Map();
    const submissionNoByHistory = new Map();
    for (const doc of submissionDocs) {
      if (!docsByHistory.has(doc.historyUid)) docsByHistory.set(doc.historyUid, []);
      docsByHistory.get(doc.historyUid).push({
        documentUid: doc.documentUid,
        documentTypeUid: doc.documentTypeUid,
        documentTypeName: doc.documentTypeName,
        documentCategory: doc.documentCategory,
        claimTopicCode: doc.claimTopicCode,
        versionNumber: doc.versionNumber,
        originalFileName: doc.originalFileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        downloadUrl: downloadUrlFor(doc.documentUid),
      });
      submissionNoByHistory.set(doc.historyUid, doc.submissionNumber);
    }
    return {
      interestUid: interest.interestUid,
      tokenUid: interest.tokenUid,
      tokenName: interest.tokenName,
      status: interest.status,
      summary: this.buildHistorySummary(interest, timeline),
      timeline: timeline.map((event) => ({
        historyUid: event.historyUid,
        eventType: event.eventType,
        submissionNumber: submissionNoByHistory.has(event.historyUid) ? submissionNoByHistory.get(event.historyUid) : null,
        rejectReasonType: event.rejectReasonType || null,
        rejectReason: event.rejectReason || null,
        rejectedClaim: event.rejectedClaim ? event.rejectedClaim.split(',').map((code) => code.trim()).filter(Boolean) : [],
        resubmitAttempt: event.resubmitAttempt,
        actorRole: event.actorRole,
        actorUserUid: event.actorUserUid,
        note: event.note || null,
        createdAt: event.createdAt,
        documents: docsByHistory.get(event.historyUid) || [],
      })),
    };
  }

  async getMyInterestHistory(user, interestUid) {
    this.assertInvestor(user);
    const investor = await this.investorRepository.findByUserUid(user.userUid);
    const interest = await this.repository.findInterestByUid(interestUid);
    if (!investor || !interest || interest.investorUid !== investor.investorUid) {
      throw ApiError.notFound('Investment interest was not found.');
    }
    // Investor downloads their own document versions via the investor documents endpoint.
    return this.assembleHistory(interest, (documentUid) => `/api/v1/investors/me/documents/${documentUid}/download`);
  }

  async getIssuerInterestHistory(user, interestUid) {
    const organization = await this.issuerOrganization(user);
    const interest = await this.repository.findInterestByUid(interestUid);
    if (!interest || interest.organizationUid !== organization.organizationUid) {
      throw ApiError.notFound('Investment interest was not found.');
    }
    // Issuer downloads only within their own application's submission snapshot.
    return this.assembleHistory(interest, (documentUid) => `/api/v1/investments/issuer/interests/${interest.interestUid}/documents/${documentUid}/download`);
  }

  // Parses a comma-separated rejectedClaim column into a Set of claim-topic codes.
  rejectedClaimSet(interest) {
    return new Set(
      String(interest?.rejectedClaim || '')
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    );
  }

  // Investor-facing: for a token, list every claim topic the issuer requires, whether the
  // investor already has a document for it, and the documents they've submitted. The frontend
  // uses this to prompt the investor to upload the missing claim-topic documents (via the
  // existing investor document upload endpoint) before expressing interest.
  async getRequiredDocuments(user, tokenUid) {
    this.assertInvestor(user);
    const token = await this.repository.findMarketplaceTokenByUid(tokenUid);
    if (!token) throw ApiError.notFound('Token was not found.');

    const requiredClaimTopics = await this.tokenRepository.listClaimTopics(tokenUid);
    const investor = await this.investorRepository.findByUserUid(user.userUid);
    const investorDocuments = investor
      ? await this.investorRepository.listDocuments(investor.investorUid)
      : [];
    const interest = investor
      ? await this.repository.findActiveInterest(tokenUid, investor.investorUid)
      : null;

    // Each required topic is flagged `missing` (no document) and/or `rejected` (its code is
    // present in the interest's rejectedClaim). Rejection + resubmission info comes from the
    // interest row.
    const rejectedSet = this.rejectedClaimSet(interest);
    const eligibility = this.buildEligibility(requiredClaimTopics, investorDocuments, rejectedSet);

    let rejection = null;
    if (interest && interest.status === 'rejected') {
      const rejectedCount = Number(interest.rejectedCount);
      const canResubmitClaim = Number(interest.canResubmitClaim);
      rejection = {
        rejectReasonType: interest.rejectReasonType,
        rejectReason: interest.rejectReason,
        rejectedClaim: [...rejectedSet],
        rejectedCount,
        canResubmitClaim,
        resubmitRemaining: Math.max(0, rejectedCount - canResubmitClaim),
        canResubmit: interest.rejectReasonType === 'DOC_REJECTED' && canResubmitClaim < rejectedCount,
      };
    }

    return {
      tokenUid: token.tokenUid,
      tokenName: token.tokenName,
      tokenSymbol: token.tokenSymbol,
      onboardingComplete: Boolean(investor && investor.status === 'submitted'),
      interestStatus: interest ? interest.status : null,
      rejection,
      ...eligibility,
    };
  }

  // -------------------------------------------------------- submit interest

  // Always creates (or refreshes) a tokenInvestmentInterest record. When every required
  // claim-topic document is present the record is 'submitIntrest' (visible to the issuer);
  // when a required document is still missing it is 'pending' (invisible to the issuer, but
  // it authorizes the investor to upload the missing documents afterwards).
  async submitInterest(user, tokenUid, { note } = {}) {
    this.assertInvestor(user);
    const investor = await this.investorRepository.findByUserUid(user.userUid);
    if (!investor) throw ApiError.badRequest('Complete your investor onboarding before expressing interest.');
    if (investor.status !== 'submitted') {
      throw ApiError.conflict('Submit your investor onboarding before expressing interest in a token.');
    }
    if (!investor.walletAddress) {
      throw ApiError.badRequest('Your investor profile does not have a wallet address.');
    }

    const token = await this.repository.findMarketplaceTokenByUid(tokenUid);
    if (!token) throw ApiError.notFound('Token was not found.');
    if (token.status !== 'deployed') {
      throw ApiError.conflict('This token is not open for investment yet.');
    }

    // Claim-topic eligibility decides pending vs submitIntrest.
    const requiredClaimTopics = await this.tokenRepository.listClaimTopics(tokenUid);
    const investorDocuments = await this.investorRepository.listDocuments(investor.investorUid);
    const { eligible } = this.buildEligibility(requiredClaimTopics, investorDocuments);
    const status = eligible ? 'submitIntrest' : 'pending';

    const ids = { tokenUid, organizationUid: token.organizationUid, investorUid: investor.investorUid };

    const existing = await this.repository.findActiveInterest(tokenUid, investor.investorUid);
    if (existing) {
      // Already decided by the issuer — do not silently overwrite.
      if (existing.status === 'verifiedByIssuer' || existing.status === 'approved') {
        throw ApiError.conflict('This interest has already been verified by the issuer.');
      }
      if (existing.status === 'rejected') {
        throw ApiError.conflict('Your previous request was rejected; resubmit the rejected documents instead.');
      }
      // pending -> submitIntrest promotion (or a no-op refresh) when documents are now complete.
      const updated = await this.repository.updateInterestByUid(existing.interestUid, {
        status,
        note: note === undefined ? undefined : (note || null),
      });
      if (existing.status === 'pending' && status === 'submitIntrest') {
        await this.recordSubmission({ ...ids, interestUid: existing.interestUid }, { eventType: 'submitted', actorUserUid: user.userUid });
      }
      return updated;
    }

    const created = await this.repository.createInterest({
      ...ids,
      investorUserUid: user.userUid,
      walletAddress: investor.walletAddress,
      status,
      note: note || null,
    });
    if (status === 'submitIntrest') {
      await this.recordSubmission({ ...ids, interestUid: created.interestUid }, { eventType: 'submitted', actorUserUid: user.userUid });
    }
    return created;
  }

  // ------------------------------------------------- upload gate + resubmit sync

  // Called by the investor document-upload flow (for a *submitted* investor): upload is only
  // permitted when the investor has a 'pending' interest, or a DOC_REJECTED interest that
  // still has resubmission attempts left. Throws otherwise.
  async assertClaimUploadAllowed(investorUid) {
    const interests = await this.repository.listActiveInterestsByInvestor(investorUid);
    const allowed = interests.some((interest) => interest.status === 'pending'
      || (interest.status === 'rejected'
        && interest.rejectReasonType === 'DOC_REJECTED'
        && Number(interest.canResubmitClaim) < Number(interest.rejectedCount)));
    if (!allowed) {
      throw new ApiError(
        403,
        'Document upload is available only when you have a pending or resubmittable investment-interest request.',
        undefined,
        'INVESTOR_DOCUMENT_UPLOAD_NOT_ALLOWED',
      );
    }
  }

  // Called after an investor uploads/changes documents. Promotes 'pending' interests to
  // 'submitIntrest' once complete, and resolves DOC_REJECTED interests whose rejected claim
  // topics have all been re-uploaded (incrementing canResubmitClaim, capped at rejectedCount).
  async syncInterestsForInvestor(investorUid, actorUserUid = null) {
    const interests = await this.repository.listActiveInterestsByInvestor(investorUid);
    if (!interests.length) return;
    const documents = await this.investorRepository.listDocuments(investorUid);
    const documentCodes = new Set(documents.map((doc) => doc.claimTopicCode).filter(Boolean));

    for (const interest of interests) {
      const ids = {
        interestUid: interest.interestUid,
        tokenUid: interest.tokenUid,
        organizationUid: interest.organizationUid,
        investorUid: interest.investorUid,
      };
      if (interest.status === 'pending') {
        const required = await this.tokenRepository.listClaimTopics(interest.tokenUid);
        const complete = required.every((topic) => documentCodes.has(topic.claimTopicCode));
        if (complete) {
          await this.repository.updateInterestByUid(interest.interestUid, { status: 'submitIntrest' });
          await this.recordSubmission(ids, { eventType: 'submitted', actorUserUid });
        }
        continue;
      }
      if (interest.status === 'rejected' && interest.rejectReasonType === 'DOC_REJECTED') {
        const canResubmitClaim = Number(interest.canResubmitClaim);
        const rejectedCount = Number(interest.rejectedCount);
        if (canResubmitClaim >= rejectedCount) continue; // resubmission limit reached
        const rejectedCodes = [...this.rejectedClaimSet(interest)];
        if (!rejectedCodes.length) continue;
        // A rejected claim is "resubmitted" when a document for it was uploaded AFTER the
        // rejection decision (createdAt > decisionAt).
        const decisionAt = interest.decisionAt ? new Date(interest.decisionAt).getTime() : 0;
        const allResubmitted = rejectedCodes.every((code) => documents.some((doc) => doc.claimTopicCode === code
          && doc.createdAt && new Date(doc.createdAt).getTime() > decisionAt));
        if (allResubmitted) {
          const attempt = canResubmitClaim + 1;
          await this.repository.updateInterestByUid(interest.interestUid, {
            status: 'submitIntrest',
            canResubmitClaim: attempt,
            rejectedClaim: null,
          });
          // Records the resubmission (attempt number + the claim topics that were re-uploaded)
          // and snapshots the newly-current document versions for this submission.
          await this.recordSubmission(ids, {
            eventType: 'resubmitted',
            rejectedClaim: interest.rejectedClaim,
            resubmitAttempt: attempt,
            actorUserUid,
          });
        }
      }
    }
  }

  async listMyInterests(user, query = {}) {
    this.assertInvestor(user);
    const investor = await this.investorRepository.findByUserUid(user.userUid);
    if (!investor) return [];
    return this.repository.listInterestsByInvestor(investor.investorUid, { status: query.status });
  }

  // ------------------------------------------------------------- issuer view

  async issuerOrganization(user) {
    this.assertIssuer(user);
    const organization = await this.organizationRepository.findByUserUid(user.userUid);
    if (!organization) throw ApiError.badRequest('No organization is associated with this issuer account.');
    return organization;
  }

  async listIssuerInterests(user, query = {}) {
    const organization = await this.issuerOrganization(user);
    // Issuers only ever review submitted ('submitIntrest') interests by default.
    return this.repository.listInterestsByOrganization(organization.organizationUid, {
      status: query.status || 'submitIntrest',
    });
  }

  // Loads a submitted interest the issuer owns and asserts it is reviewable.
  async loadReviewableInterest(user, interestUid) {
    const organization = await this.issuerOrganization(user);
    const interest = await this.repository.findInterestByUid(interestUid);
    if (!interest || interest.organizationUid !== organization.organizationUid) {
      throw ApiError.notFound('Investment interest was not found.');
    }
    if (interest.status !== 'submitIntrest') {
      throw ApiError.conflict('Only submitted interests can be approved or rejected.');
    }
    return interest;
  }

  // The issuer's positive review sets the interest to 'verifiedByIssuer' — but ONLY when the
  // issuer's claim signatures for this subscription have been cryptographically verified (a
  // SIGNED issuerClaimVerification exists). Otherwise the status is left unchanged. A separate
  // 'approved' status is reserved for a future step (to be wired when requested).
  async approveInterest(user, interestUid) {
    const interest = await this.loadReviewableInterest(user, interestUid);
    if (this.issuerClaimRepository) {
      const signed = await this.issuerClaimRepository.findLatestVerificationByStatus(interest.interestUid, 'SIGNED');
      if (!signed) {
        throw new ApiError(
          409,
          'Issuer claim signatures must be verified (SIGNED) before this subscription can be verified by the issuer.',
          undefined,
          'ISSUER_CLAIMS_NOT_VERIFIED',
        );
      }
    }
    const updated = await this.repository.updateInterestByUid(interest.interestUid, {
      status: 'verifiedByIssuer',
      decisionAt: new Date(),
    });
    await this.recordHistory(this.interestIds(interest), { eventType: 'approved', actorRole: 'issuer', actorUserUid: user.userUid });
    return updated;
  }

  interestIds(interest) {
    return {
      interestUid: interest.interestUid,
      tokenUid: interest.tokenUid,
      organizationUid: interest.organizationUid,
      investorUid: interest.investorUid,
    };
  }

  // Rejects a submitted interest. DOC_REJECTED requires the rejected claim-topic codes (stored
  // comma-separated in rejectedClaim); OTHER needs no claim selection. canResubmitClaim is not
  // reset — it accumulates across the interest lifecycle so the rejectedCount cap is real.
  async rejectInterest(user, interestUid, { rejectReasonType, rejectReason, rejectedClaims = [] }) {
    const interest = await this.loadReviewableInterest(user, interestUid);

    let rejectedClaim = null;
    if (rejectReasonType === 'DOC_REJECTED') {
      const required = await this.tokenRepository.listClaimTopics(interest.tokenUid);
      const requiredCodes = new Set(required.map((topic) => topic.claimTopicCode));
      const codes = [...new Set(rejectedClaims)];
      if (!codes.length) {
        throw ApiError.badRequest('Select at least one rejected claim topic for a DOC_REJECTED rejection.');
      }
      const invalid = codes.filter((code) => !requiredCodes.has(code));
      if (invalid.length) {
        throw ApiError.badRequest('One or more rejected claim topics are not required by this token.', invalid.map((code) => ({ field: 'rejectedClaims', message: `${code} is not a required claim topic.` })));
      }
      rejectedClaim = codes.join(',');
    }

    const updated = await this.repository.updateInterestByUid(interest.interestUid, {
      status: 'rejected',
      rejectReasonType,
      rejectReason: rejectReason || null,
      rejectedClaim,
      decisionAt: new Date(),
    });
    // Timeline event capturing this rejection's reason type, description, and rejected claims.
    await this.recordHistory(this.interestIds(interest), {
      eventType: 'rejected',
      rejectReasonType,
      rejectReason: rejectReason || null,
      rejectedClaim,
      actorRole: 'issuer',
      actorUserUid: user.userUid,
    });
    return updated;
  }

  // Loads a single interest, asserts it belongs to the issuer's organization, and returns
  // it together with every document the investor submitted and the token's required
  // claim-topic breakdown (so the issuer can confirm the KYC / accreditation documents).
  async getIssuerInterest(user, interestUid) {
    const organization = await this.issuerOrganization(user);
    const interest = await this.repository.findInterestByUid(interestUid);
    if (!interest || interest.organizationUid !== organization.organizationUid) {
      throw ApiError.notFound('Investment interest was not found.');
    }
    const [requiredClaimTopics, submissionDocs, timeline] = await Promise.all([
      this.tokenRepository.listClaimTopics(interest.tokenUid),
      this.repository.listSubmissionDocumentsByInterest(interest.interestUid),
      this.repository.listHistoryByInterest(interest.interestUid),
    ]);

    // The issuer sees only the documents the investor submitted to THIS application, at the exact
    // versions of the latest submission — never the investor's live profile or other versions.
    const latestSubmissionNumber = submissionDocs.reduce((max, doc) => Math.max(max, doc.submissionNumber), 0);
    const latestDocs = submissionDocs.filter((doc) => doc.submissionNumber === latestSubmissionNumber);
    const eligibility = this.buildEligibility(requiredClaimTopics, latestDocs);
    return {
      ...interest,
      // Resubmission / rejection counts so the issuer sees how many times this investor was
      // rejected and has resubmitted (full detail via the /history endpoint).
      resubmissionSummary: this.buildHistorySummary(interest, timeline),
      submissionNumber: latestSubmissionNumber || null,
      documents: latestDocs.map((doc) => ({
        documentUid: doc.documentUid,
        documentTypeUid: doc.documentTypeUid,
        documentTypeName: doc.documentTypeName,
        documentCategory: doc.documentCategory,
        claimTopicCode: doc.claimTopicCode,
        versionNumber: doc.versionNumber,
        originalFileName: doc.originalFileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        downloadUrl: `/api/v1/investments/issuer/interests/${interestUid}/documents/${doc.documentUid}/download`,
      })),
      ...eligibility,
    };
  }

  async getIssuerInterestDocumentForDownload(user, interestUid, documentUid) {
    const organization = await this.issuerOrganization(user);
    const interest = await this.repository.findInterestByUid(interestUid);
    if (!interest || interest.organizationUid !== organization.organizationUid) {
      throw ApiError.notFound('Investment interest was not found.');
    }
    // The document must belong to a submission snapshot of THIS application — the issuer can
    // never reach the investor's other document versions or other applications' documents.
    const document = await this.repository.findSubmissionDocument(interestUid, documentUid);
    if (!document) throw ApiError.notFound('Document was not found for this application.');

    const directory = path.resolve(this.investorUploadsDir);
    const filePath = path.resolve(directory, document.storageKey);
    if (!filePath.startsWith(`${directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw ApiError.notFound('The document file is no longer available.');
    }
    return { document, filePath };
  }
}

module.exports = { InvestmentService, presentToken };
