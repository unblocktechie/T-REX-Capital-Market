import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getIssuerApprovalProgress } from '../src/utils/issuerApprovalProgress.js';

const modal = readFileSync(new URL('../src/components/issuer/IssuerInterestDecisionModals.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/assets/styles/investor.css', import.meta.url), 'utf8');

test('wallet prompts use the specified identity and eligibility titles and descriptions', () => {
  assert.match(modal, /title: 'Confirm Identity Verification'/);
  assert.match(modal, /description: "Review and confirm the investor's identity verification in your wallet\."/);
  assert.match(modal, /title: 'Confirm Investment Eligibility'/);
  assert.match(modal, /description: "Review and confirm the investor's investment eligibility in your wallet\."/);
  assert.match(modal, /<strong>\{walletConfirmationCopy\.title\}<\/strong>/);
  assert.match(modal, /<p>\{walletConfirmationCopy\.description\}<\/p>/);
  assert.doesNotMatch(modal, /Confirm this check in your wallet/);
});

test('registration wallet prompt uses the exact heading and copy', () => {
  assert.match(modal, /'Register Investor On-Chain'/);
  assert.match(modal, /"Confirm the registration transaction in your wallet to add the verified investor to the token's Identity Registry\."/);
  assert.match(modal, /status === 'REGISTERING' \? 'issuer-claim-signing-state'/);
  assert.match(modal, /status === 'REGISTERING'\s*\? <span className="issuer-claim-signing-state__spinner"/);
});

test('separate equal-width progress segments replace the previous fractional fill', () => {
  assert.match(modal, /className="issuer-claim-progress-tracker"/);
  assert.match(modal, /className="issuer-claim-progress-segments"/);
  assert.match(modal, /progress\.signatures\.map\(\(step, index\) => \(/);
  assert.match(modal, /className=\{`issuer-claim-progress-segment is-\$\{registration\.state/);
  assert.match(modal, /Step \{currentStepNumber\} of \{progress\.totalCount\}/);
  assert.match(styles, /\.issuer-claim-progress-segments\s*\{[^}]*display:\s*flex;[^}]*gap:\s*6px;/);
  assert.match(styles, /\.issuer-claim-progress-segment\s*\{[^}]*flex:\s*1 1 0;/);
  assert.doesNotMatch(modal, /issuer-claim-progress-bar/);
});

test('only a confirmed registration fills the final segment as complete', () => {
  const requested = getIssuerApprovalProgress({ claimCount: 2, status: 'REGISTERING' });
  const submitted = getIssuerApprovalProgress({ claimCount: 2, status: 'REGISTRY_PENDING' });
  const failed = getIssuerApprovalProgress({ claimCount: 2, status: 'REGISTRY_FAILED' });
  const confirmed = getIssuerApprovalProgress({ claimCount: 2, status: 'REGISTERED' });
  assert.equal(requested.completedCount, 2);
  assert.equal(submitted.completedCount, 2);
  assert.equal(failed.completedCount, 2);
  assert.equal(confirmed.completedCount, 3);
  assert.match(modal, /registration\.state === 'complete' \? 'complete'/);
  assert.match(modal, /registration\.state === 'pending' \? 'pending'/);
  assert.match(modal, /registration\.state === 'failed' \? 'failed'/);
});

test('segmented tracker adapts to mobile width and reduced motion', () => {
  assert.match(styles, /\.issuer-claim-progress-tracker\s*\{[^}]*width:\s*min\(340px, 100%\)/);
  assert.match(styles, /\.issuer-claim-progress-segment\s*\{[^}]*min-width:\s*0;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.issuer-claim-signature-modal footer/);
});
