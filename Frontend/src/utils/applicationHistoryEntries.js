import { isRegistryRegistrationConfirmedEvent } from './investmentPurchase.js';

const normalizeEventType = (value) => String(value || '')
  .trim().toLowerCase().replace(/[\s_-]+/g, '');

export const isIssuerApprovalEvent = (event) => {
  const type = normalizeEventType(event?.eventType);
  if (['approved', 'verified', 'verifiedbyissuer', 'claimverified', 'claimsverified'].includes(type)) return true;
  // Some older backends store the issuer approval under a generic event type.
  // Only use these records if the note and actor explicitly identify issuer verification.
  const note = String(event?.note || '').toLowerCase();
  return String(event?.actorRole || '').toLowerCase() === 'issuer'
    && /claim|profile|issuer/.test(note)
    && /verified|verification|approved/.test(note);
};

const endsReviewCycle = (event) => [
  'submitted', 'resubmitted', 'rejected', 'cancelled', 'claimsubmitted',
].includes(normalizeEventType(event?.eventType));

/**
 * Combine the two confirmed operations of the NEW Step 2 into one visual
 * history milestone. Both backend events remain intact; their timestamps and
 * actors are preserved in issuerStepEvents. Older claims-first histories are
 * deliberately not grouped across the investor's claim-submission event.
 */
export const buildApplicationHistoryEntries = (timeline = []) => {
  const events = (Array.isArray(timeline) ? timeline : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  const groupedReviewIds = new Set();
  const entries = [];

  events.forEach((event, index) => {
    if (groupedReviewIds.has(event.id)) return;
    if (!isRegistryRegistrationConfirmedEvent(event)) {
      entries.push(event);
      return;
    }

    let review = null;
    for (let olderIndex = index + 1; olderIndex < events.length; olderIndex += 1) {
      const candidate = events[olderIndex];
      // Never move a review across a different submission cycle, a claim
      // submission (legacy journey), or another registry confirmation.
      if (endsReviewCycle(candidate) || isRegistryRegistrationConfirmedEvent(candidate)) break;
      if (!groupedReviewIds.has(candidate.id) && isIssuerApprovalEvent(candidate)) {
        review = candidate;
        break;
      }
    }

    if (!review) {
      entries.push(event);
      return;
    }

    groupedReviewIds.add(review.id);
    entries.push({
      ...event,
      id: `issuer-step-2-${review.id}-${event.id}`,
      issuerStepEvents: { verification: review, registration: event },
    });
  });

  return entries;
};

/**
 * The investor must not see a completed issuer review while Identity Registry
 * registration is still unfinished. We still preserve submitted documents,
 * reuploads, rejections, and historical claims-first activity; only the
 * partial issuer approval milestone is hidden. Paired, confirmed Step 2 events
 * remain visible as a single entry. Never alter the actual backend timeline.
 */
export const visibleApplicationHistoryEntries = (timeline = [], {
  viewerRole = '', registryRegistrationConfirmed = false, issuerVerificationConfirmed = false,
  applicationComplete = false,
} = {}) => {
  const entries = buildApplicationHistoryEntries(timeline);
  if (viewerRole !== 'investor') return entries;
  const issuerStepConfirmed = applicationComplete
    || (issuerVerificationConfirmed && registryRegistrationConfirmed)
    || entries.some((entry) => Boolean(entry.issuerStepEvents));
  if (issuerStepConfirmed) return entries;
  return entries.filter((entry) => {
    const type = normalizeEventType(entry?.eventType);
    const issuerRegistryActivity = type.includes('registry')
      || (String(entry?.actorRole || '').toLowerCase() === 'issuer'
        && /registry|registration/i.test(String(entry?.note || '')));
    return !isIssuerApprovalEvent(entry) && !issuerRegistryActivity;
  });
};
