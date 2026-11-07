import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getIssuerApprovalProgress } from '../src/utils/issuerApprovalProgress.js';

const component = readFileSync(new URL('../src/components/issuer/IssuerInterestDecisionModals.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/assets/styles/investor.css', import.meta.url), 'utf8');

test('uses the requested issuer step title and CTA', () => {
  assert.match(component, /title="Step 2 · Verify & Register Investor"/);
  assert.match(component, /'Verify & Register Investor'/);
});

test('shows one checklist combining the claim signatures with the final registration', () => {
  const checklist = component.slice(component.indexOf('className="issuer-claim-list-section"'));
  assert.match(checklist, /Verification &amp; Registration/);
  assert.match(checklist, /claims\.map\(\(claim, index\) => \(/);
  assert.match(checklist, /\{index \+ 1\}/);
  assert.match(checklist, /\{claims\.length \+ 1\}/);
  assert.match(checklist, /Wallet signature/);
  assert.match(checklist, /<strong>Register investor<\/strong>/);
  assert.match(checklist, /On-chain transaction/);
  assert.match(checklist, /Network gas fees apply/);
  assert.doesNotMatch(checklist, /Checks to approve \(/);
  assert.doesNotMatch(checklist, /Then one registry transaction/);
});

test('describes 2 signatures + 1 registration without hardcoding claim count', () => {
  assert.match(component, /\{claims\.length\} Signature\{claims\.length === 1 \? '' : 's'\} \+ 1 Registration/);
  assert.match(component, /only registration requires a network gas fee/);
  assert.match(component, /The investor submits their own claims afterward/);
});

test('continues to sign every required claim before backend verification and registration', () => {
  const signing = component.indexOf("method: 'personal_sign'");
  const verify = component.indexOf('issuerInvestorSubscriptionsService.submitClaimSignatures(');
  const statusSigned = component.indexOf("if (backendStatus === 'SIGNED')");
  const register = component.indexOf('await handleRegistration();', statusSigned);
  assert.ok(signing >= 0 && signing < verify && verify < statusSigned && statusSigned < register);
  assert.match(component, /if \(outcome === 'CONFIRMED'\) setStatus\('REGISTERED'\)/);
  assert.match(component, /else if \(outcome === 'PENDING'\) setStatus\('REGISTRY_PENDING'\)/);
});

test('pending and failed registry attempts never display as completed steps', () => {
  for (const status of ['REGISTRY_PENDING', 'REGISTRY_FAILED']) {
    const progress = getIssuerApprovalProgress({ claimCount: 2, status });
    assert.equal(progress.totalCount, 3);
    assert.equal(progress.completedCount, 2);
    assert.notEqual(progress.registration.state, 'complete');
  }
  assert.equal(getIssuerApprovalProgress({ claimCount: 2, status: 'REGISTERED' }).completedCount, 3);
});

test('registration has distinct neutral styling and text wraps on mobile', () => {
  assert.match(styles, /\.issuer-claim-list__item--registration\s*\{/);
  assert.match(styles, /\.issuer-claim-list__type--registration\s*\{/);
  assert.match(styles, /\.issuer-claim-list__title\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.issuer-claim-list__type\s*\{[^}]*white-space:\s*normal/);
  assert.match(styles, /\.issuer-claim-progress-list > div\.issuer-claim-progress-registration\.is-pending/);
});
