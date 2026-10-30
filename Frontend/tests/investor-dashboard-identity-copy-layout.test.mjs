import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../src/pages/dashboard/DashboardPage.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/assets/styles/investor.css', import.meta.url), 'utf8');

test('technical identity reference has an adjacent icon-only copy control', () => {
  const technicalDetails = component.slice(component.indexOf('className="investor-technical-details investor-technical-details--compact"'));
  assert.match(technicalDetails, /<span>Technical identity reference<\/span>\s*<div className="investor-dashboard-live__identity-reference-value">/);
  assert.match(technicalDetails, /<strong title=\{profile\.onchainId \|\| undefined\}>/);
  assert.match(technicalDetails, /<button type="button" onClick=\{copyIdentity\} aria-label="Copy technical identity reference" title="Copy identity reference">\s*<Copy size=\{14\} aria-hidden="true" \/>\s*<\/button>/);
  assert.doesNotMatch(technicalDetails.slice(0, technicalDetails.indexOf('</details>')), /Copy reference/);
});

test('copy action retains full reference and success feedback', () => {
  assert.match(component, /const copyIdentity = async \(\) => \{\s*const value = profile\.onchainId \|\| profile\.profileId;/);
  assert.match(component, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(component, /toast\.success\('Identity reference copied\.'\)/);
});

test('icon stays beside the value with responsive sizing and a focus state', () => {
  assert.match(css, /\.investor-dashboard-live__hero \.investor-dashboard-live__identity-reference-value \{[^}]*display: flex;[^}]*align-items: center;/);
  assert.match(css, /\.investor-dashboard-live__hero \.investor-dashboard-live__identity-reference-value > strong \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.investor-dashboard-live__hero \.investor-dashboard-live__identity-reference-value > button \{[^}]*flex: 0 0 30px;[^}]*padding: 0;/);
  assert.match(css, /\.investor-dashboard-live__hero \.investor-dashboard-live__identity-reference-value > button:focus-visible/);
});
