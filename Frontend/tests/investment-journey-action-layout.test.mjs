import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tracker = readFileSync(new URL('../src/components/application-history/InvestmentJourneyTracker.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/assets/styles/investor.css', import.meta.url), 'utf8');
const details = readFileSync(new URL('../src/pages/investor-portal/ApplicationDetailsPage.jsx', import.meta.url), 'utf8');

test('step-three help avoids repeating the completed issuer registration prerequisite', () => {
  assert.match(tracker, /action: 'Submit each required claim using your investor wallet\.'/);
  assert.doesNotMatch(tracker, /Complete each required claim transaction once issuer registration is confirmed/);
});

test('status and next owner are grouped above either primary CTA', () => {
  assert.match(tracker, /const hasActions = Boolean\(action \|\| secondaryAction\);/);
  assert.match(tracker, /const statusMeta = \([\s\S]*investment-journey__status[\s\S]*investment-journey__owner[\s\S]*\);/);
  assert.match(tracker, /!hasActions \? statusMeta : null/);
  assert.match(tracker, /\{hasActions \? \(\s*<div className="investment-journey__actions-panel">\s*\{statusMeta\}\s*<div className="investment-journey__actions">\s*\{action\}\s*\{secondaryAction\}/);
  assert.match(details, />Complete Verification<\/Button>/);
  assert.match(details, />Invest Now<\/Button>/);
});

test('action panel aligns status above buttons on wide and narrow screens', () => {
  assert.match(css, /\.investment-journey__actions-panel \{[^}]*flex-direction: column;[^}]*align-items: flex-end;[^}]*\}/);
  assert.match(css, /\.investment-journey__actions-panel \.investment-journey__current-meta \{[^}]*justify-content: flex-end;/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.investment-journey__actions-panel \{[^}]*grid-column: 1 \/ -1;[^}]*\}/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.investment-journey__actions-panel \{[^}]*padding-left: 0;[^}]*\}/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.investment-journey__actions \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*\}/);
});
