import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { visibleApplicationHistoryEntries } from '../src/utils/applicationHistoryEntries.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const submitted = { id: 'app', eventType: 'submitted', createdAt: '2026-10-29T01:00:00Z', actorRole: 'investor' };
const verified = { id: 'verify', eventType: 'approved', createdAt: '2026-10-29T01:04:00Z', actorRole: 'issuer' };
const registration = { id: 'registry', eventType: 'registryRegistrationConfirmed', createdAt: '2026-10-29T01:05:00Z', actorRole: 'issuer' };
const updated = { id: 'update', eventType: 'resubmitted', createdAt: '2026-10-29T01:02:00Z', actorRole: 'investor' };

test('investor pending Step 2 sees submitted application, not premature issuer approval', () => {
  const source = [submitted, verified];
  const visible = visibleApplicationHistoryEntries(source, {viewerRole: 'investor', issuerVerificationConfirmed: true, registryRegistrationConfirmed: false});
  assert.deepEqual(visible.map((event) => event.id), ['app']);
  assert.equal(source.length, 2);
});

test('issuer sees verification event while registration is pending, preserving evidence and retry', () => {
  assert.deepEqual(visibleApplicationHistoryEntries([submitted, verified], {viewerRole: 'issuer'}).map((event) => event.id), ['verify', 'app']);
  // Frontend journey status remains on Step 2 with Registration Pending.
});

test('confirmed registration reveals a single combined issuer milestone', () => {
  const visible = visibleApplicationHistoryEntries([submitted, verified, registration], {
    viewerRole: 'investor', issuerVerificationConfirmed: true, registryRegistrationConfirmed: true,
  });
  assert.equal(visible.length, 2);
  assert.equal(visible[0].issuerStepEvents.verification.id, 'verify');
  assert.equal(visible[0].issuerStepEvents.registration.id, 'registry');
  assert.equal(visible[1].id, 'app');
});

test('document resubmission history and legacy claims-first events remain intact', () => {
  const claims = {id: 'claims', eventType: 'claimSubmitted', createdAt: '2026-10-29T01:04:30Z', actorRole: 'investor'};
  const result = visibleApplicationHistoryEntries([submitted, updated, verified, claims], {viewerRole:'investor'});
  assert.deepEqual(result.map((event) => event.id), ['claims', 'update', 'app']);
});

test('issuer registration UI keeps a bounded action button and pending status until confirmation', async () => {
  const page = await read('../src/pages/issuer/IssuerInvestorSubscriptionReviewPage.jsx');
  const css = await read('../src/assets/styles/investor.css');
  const history = await read('../src/components/application-history/ApplicationHistory.jsx');
  assert.match(page, /<strong>Registration Pending<\/strong>/);
  assert.match(page, /Register Investor/);
  assert.match(page, /registryTransactionPending\s*\?/);
  assert.match(css, /\.issuer-registry-action__pending\s*\{/);
  assert.match(css, /\.issuer-application-overview-card__actions--registry \.issuer-registry-action > \.button\s*\{/);
  assert.match(css, /white-space: normal/);
  assert.match(history, /title: 'Registration Pending'/);
  assert.match(history, /registryRegistrationConfirmed/);
});

test('issuer Step 2 remains pending rather than completed after signatures', async () => {
  const journey = await read('../src/utils/investmentJourney.js');
  assert.match(journey, /if \(issuerVerified && !registryConfirmed\)/);
  assert.match(journey, /statusLabel: role === 'issuer' \? 'Registration Pending' : 'Pending'/);
  assert.match(journey, /currentIndex: 1/);
});

test('investor also hides any pending registry-operation history', () => {
  const pendingRegistry = {id:'created', eventType:'registryRegistrationPending', actorRole:'issuer', createdAt:'2026-10-29T01:05:00Z'};
  assert.deepEqual(visibleApplicationHistoryEntries([submitted, verified, pendingRegistry], {viewerRole:'investor'}).map(e => e.id), ['app']);
});
