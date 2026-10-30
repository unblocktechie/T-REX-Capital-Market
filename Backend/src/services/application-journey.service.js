// Shared by HTTP confirmations and both read-only blockchain recovery paths.
class ApplicationJourneyService {
  constructor({ registryRepository, interestRepository }) {
    this.registryRepository = registryRepository;
    this.interestRepository = interestRepository;
  }

  async progress(interest, executor) {
    const [issuer, claims, registration] = await Promise.all([
      this.registryRepository.getIssuerClaimCompletion(interest.interestUid, interest.tokenUid, executor),
      this.registryRepository.getClaimCompletion(interest.interestUid, interest.tokenUid, executor),
      this.registryRepository.findByInterest(interest.interestUid, executor),
    ]);
    const issuerVerificationConfirmed = issuer.required > 0 && issuer.missing.length === 0;
    const claimsConfirmed = claims.required > 0 && claims.missing.length === 0;
    const registryRegistrationConfirmed = registration?.status === 'CONFIRMED';
    const active = ['verifiedByIssuer', 'claimSubmitted', 'registered'].includes(interest.status);
    const canSubmitClaims = active && issuerVerificationConfirmed && registryRegistrationConfirmed;
    return { issuerVerificationConfirmed, claimsConfirmed, registryRegistrationConfirmed,
      canSubmitClaims, canInvest: canSubmitClaims && claimsConfirmed,
      journeyStage: !canSubmitClaims ? 'PENDING' : claimsConfirmed ? 'COMPLETED' : 'AWAITING_INVESTOR_CLAIMS' };
  }

  async reconcile(chainId, transactionRunner) {
    const candidates = await this.registryRepository.listJourneyCandidates(chainId);
    for (const candidate of candidates) {
      await transactionRunner(async connection => this.synchronize(
        await this.interestRepository.findInterestForUpdate(candidate.interestUid, connection), connection,
      ));
    }
  }

  // Caller must hold the interest row lock. Conditional transition prevents duplicate history.
  async synchronize(interest, executor, actor = {}) {
    if (!interest) return null;
    const progress = await this.progress(interest, executor);
    if (progress.canInvest && interest.status !== 'registered') {
      const changed = await this.interestRepository.transitionInterestStatus(
        interest.interestUid, interest.status, 'registered', executor,
      );
      if (changed) {
        await this.interestRepository.createHistory({
          interestUid: interest.interestUid, tokenUid: interest.tokenUid,
          organizationUid: interest.organizationUid, investorUid: interest.investorUid,
          eventType: 'claimSubmitted', actorRole: actor.actorRole || 'system',
          actorUserUid: actor.actorUserUid || null,
          note: 'Application completed: issuer verification, Identity Registry registration and all investor claims are confirmed.',
        }, executor);
        interest = { ...interest, status: 'registered' };
      }
    }
    return { ...interest, ...progress };
  }
}
module.exports = { ApplicationJourneyService };
