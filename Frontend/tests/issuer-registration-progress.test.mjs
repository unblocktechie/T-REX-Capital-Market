import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getIssuerApprovalProgress } from '../src/utils/issuerApprovalProgress.js';

const modal = readFileSync(new URL('../src/components/issuer/IssuerInterestDecisionModals.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/assets/styles/investor.css', import.meta.url), 'utf8');
const progress = (args) => getIssuerApprovalProgress({ claimCount: 2, ...args });

test('first MetaMask signature completes step one and leaves registration waiting', () => {
  const result = progress({ status: 'SIGNING', collectedCount: 1, activeClaimIndex: 1 });
  assert.equal(result.totalCount, 3);
  assert.equal(result.completedCount, 1);
  assert.equal(result.percentage, 33);
  assert.deepEqual(result.signatures, [{ complete: true, active: false }, { complete: false, active: true }]);
  assert.deepEqual(result.registration, { state: 'upcoming', label: 'Next' });
});

test('second MetaMask signature completes step two but NOT registry registration', () => {
  const result = progress({ status: 'VERIFYING', collectedCount: 2 });
  assert.equal(result.completedCount, 2);
  assert.equal(result.percentage, 67);
  assert.deepEqual(result.registration, { state: 'upcoming', label: 'Next' });
});

test('registration wallet prompt is the active third step, not complete', () => {
  const result = progress({ status: 'REGISTERING' });
  assert.equal(result.completedCount, 2);
  assert.equal(result.percentage, 67);
  assert.deepEqual(result.registration, { state: 'active', label: 'Confirm now' });
  assert.ok(result.signatures.every(({ complete }) => complete));
});

test('broadcast / pending status never completes registration', () => {
  for (const props of [
    { status: 'REGISTRY_PENDING' },
    { status: 'SIGNED', registrationPending: true },
  ]) {
    const result = progress(props);
    assert.equal(result.completedCount, 2);
    assert.equal(result.percentage, 67);
    assert.deepEqual(result.registration, { state: 'pending', label: 'Confirming' });
  }
});

test('confirmed backend evidence completes all three progress items', () => {
  for (const props of [
    { status: 'REGISTERED' },
    { status: 'REGISTRY_PENDING', registrationConfirmed: true },
  ]) {
    const result = progress(props);
    assert.equal(result.percentage, 100);
    assert.equal(result.completedCount, 3);
    assert.deepEqual(result.registration, { state: 'complete', label: 'Completed' });
  }
});

test('registration cancellation/failure keeps signatures complete and registration retryable', () => {
  const result = progress({ status: 'REGISTRY_FAILED' });
  assert.equal(result.completedCount, 2);
  assert.equal(result.percentage, 67);
  assert.deepEqual(result.registration, { state: 'failed', label: 'Retry' });
  assert.ok(result.signatures.every(({ complete }) => complete));
});

test('supports other tokens with a different number of required issuer signatures', () => {
  const result = getIssuerApprovalProgress({ claimCount: 3, collectedCount: 3, status: 'VERIFYING' });
  assert.equal(result.totalCount, 4);
  assert.equal(result.percentage, 75);
  assert.equal(result.registration.state, 'upcoming');
});

test('keeps the existing two signature rows and appends registration within the same progress list', () => {
  assert.match(modal, /className="issuer-claim-progress-list"/);
  assert.match(modal, /\{claims\.map\(\(claim, index\) => \{/);
  assert.match(modal, /<span>\{claim\.label\}<\/span>/);
  assert.match(modal, /<small>\{step\.complete \? 'Confirmed' : step\.active \? 'Confirm now' : 'Next'\}<\/small>/);
  assert.match(modal, /<div className=\{`issuer-claim-progress-registration is-\$\{registration\.state\}`\}>/);
  assert.match(modal, /<span>Registration<\/span>/);
  assert.match(modal, /\{status === ISSUER_CLAIM_SIGNING_STATUS\.SIGNING \? \(/);
  assert.match(modal, /\{status === ISSUER_CLAIM_SIGNING_STATUS\.VERIFYING \? \(/);
  assert.match(modal, /\{verifiedSignatures \? \(/);
  assert.equal((modal.match(/<IssuerApprovalProgress/g) || []).length, 3);
});

test('keeps platform dialog mounted during wallet interaction and uses the existing mobile styling', () => {
  assert.match(modal, /const isBusy = status === ISSUER_CLAIM_SIGNING_STATUS\.SIGNING \|\| status === ISSUER_CLAIM_SIGNING_STATUS\.VERIFYING \|\| status === 'REGISTERING';/);
  assert.match(modal, /const close = \(\) => \{\s*if \(isBusy\) return;/);
  assert.match(modal, /className="issuer-claim-signature-modal sm:max-w-lg"/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.issuer-claim-progress-list > div,/);
  assert.match(css, /\.issuer-claim-progress-list > div\.issuer-claim-progress-registration\.is-pending/);
});
