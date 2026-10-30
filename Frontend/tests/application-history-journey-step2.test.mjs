import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildApplicationHistoryEntries } from '../src/utils/applicationHistoryEntries.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const application = { id: 'submit', eventType: 'submitted', createdAt: '2026-10-28T10:00:00Z', actorRole: 'investor' };
const verification = { id: 'verify', eventType: 'approved', createdAt: '2026-10-28T10:10:00Z', actorRole: 'issuer' };
const registration = { id: 'register', eventType: 'registryRegistrationConfirmed', createdAt: '2026-10-28T10:11:00Z', actorRole: 'issuer' };
const claimSubmission = { id: 'claims', eventType: 'claimSubmitted', createdAt: '2026-10-28T10:12:00Z', actorRole: 'investor' };

test('new journey: issuer verification and on-chain registry registration display as one Step 2 history milestone', () => {
  const inputs = [application, registration, verification];
  const result = buildApplicationHistoryEntries(inputs);
  assert.equal(result.length, 2);
  assert.equal(result[0].issuerStepEvents.verification.id, verification.id);
  assert.equal(result[0].issuerStepEvents.registration.id, registration.id);
  assert.equal(result[0].createdAt, registration.createdAt);
  assert.equal(result[0].issuerStepEvents.verification.createdAt, verification.createdAt);
  assert.equal(result[1].id, application.id);
  assert.equal(inputs.length, 3, 'never mutate underlying history');
});

test('final investor claim submission remains an independent later event', () => {
  const result = buildApplicationHistoryEntries([application, claimSubmission, registration, verification]);
  assert.equal(result.length, 3);
  assert.equal(result[0].id, claimSubmission.id);
  assert.ok(result[1].issuerStepEvents);
  assert.equal(result[2].id, application.id);
});

test('legacy claims-first applications retain chronological events rather than reordering claim submission', () => {
  const legacyClaims = { ...claimSubmission, createdAt: '2026-10-28T10:10:30Z' };
  const result = buildApplicationHistoryEntries([registration, verification, legacyClaims, application]);
  assert.deepEqual(result.map((e) => e.id), ['register', 'claims', 'verify', 'submit']);
  assert.equal(result.some((e) => e.issuerStepEvents), false);
});

test('do not group incomplete registry transactions or registration without a verified issuer review', () => {
  const pending = { ...registration, eventType: 'registryRegistrationPending', note: 'transaction submitted' };
  assert.equal(buildApplicationHistoryEntries([application, verification, pending]).length, 3);
  const noReview = buildApplicationHistoryEntries([application, registration]);
  assert.equal(noReview.length, 2);
  assert.equal(noReview[0].issuerStepEvents, undefined);
});

test('do not group across resubmission or rejection boundaries', () => {
  const update = { id: 'resubmit', eventType: 'resubmitted', createdAt: '2026-10-28T10:10:30Z' };
  const reject = { id: 'reject', eventType: 'rejected', createdAt: '2026-10-28T10:10:30Z' };
  for (const boundary of [update, reject]) {
    const result = buildApplicationHistoryEntries([registration, boundary, verification, application]);
    assert.equal(result.some((e) => e.issuerStepEvents), false);
  }
});

test('issuer modal hides both technical-details disclosures while keeping the verification signature flow', async () => {
  const modal = await read('../src/components/issuer/IssuerInterestDecisionModals.jsx');
  assert.doesNotMatch(modal, /<summary>Technical details<\/summary>/);
  assert.match(modal, /The investor’s profile has been successfully verified\./);
  assert.match(modal, /claim\.claimTopic/);
  assert.match(modal, /registrationConfirmed/);
});

test('both issuer and investor histories show the same combined step with role-appropriate copy', async () => {
  const history = await read('../src/components/application-history/ApplicationHistory.jsx');
  const investor = await read('../src/pages/investor-portal/ApplicationDetailsPage.jsx');
  const issuer = await read('../src/pages/issuer/IssuerInvestorSubscriptionReviewPage.jsx');
  assert.match(history, /Your profile has been successfully verified! Submit your claims to complete the process and start investing\./);
  assert.match(history, /The investor’s profile has been successfully verified and registered/);
  assert.match(history, /applicationComplete\s*\?/);
  assert.match(history, /claimsConfirmed\s*\?/);
  assert.match(history, /Step 2 confirmations/);
  assert.match(investor, /visibleApplicationHistoryEntries/);
  assert.match(issuer, /buildApplicationHistoryEntries/);
  for (const page of [investor, issuer]) {
    assert.match(page, /applicationComplete=/);
    assert.match(page, /claimsConfirmed=/);
  }
});


test('completed claim histories use role-specific messages and the shared Step 2 badge is simply Complete', async () => {
  const history = await read('../src/components/application-history/ApplicationHistory.jsx');
  assert.match(history, /badge: 'Complete'/);
  assert.doesNotMatch(history, /badge: 'Step 2 complete'/);
  assert.match(history, /The investor submitted their required claims and the investor can invest subject to contract eligibility\./);
  assert.match(history, /Your required claims were submitted And You can proceed with investing\./);
  // Pending applications must not be told investing is available yet.
  assert.match(history, /if \(applicationComplete\)/);
  assert.match(history, /application is awaiting final confirmation/);
  assert.match(history, /claimSubmittedCopy\('investor', applicationComplete\)/);
  assert.match(history, /defaultEventCopy\(event, viewerRole, applicationComplete\)/);
});
