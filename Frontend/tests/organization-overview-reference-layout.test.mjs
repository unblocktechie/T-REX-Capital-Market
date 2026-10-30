import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';
import postcss from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/postcss/lib/postcss.js';

const pageFile = resolve('src/pages/organization/OrganizationOverviewPage.jsx');
const styleFile = resolve('src/assets/styles/organization.css');
const source = readFileSync(pageFile, 'utf8');
const styles = readFileSync(styleFile, 'utf8');

test('verified organization uses a detail-first card grid without redundant metric/hero cards', () => {
  assert.match(source, /org-overview-page--reference/);
  assert.match(source, /org-overview-showcase/);
  assert.match(source, /org-overview-lower-grid/);
  assert.doesNotMatch(source, /<OrganizationSummaryHeader/);
  assert.doesNotMatch(source, /org-overview-metrics--enhanced/);
  assert.match(styles, /\.org-overview-page--reference \.org-overview-showcase\s*\{\s*grid-template-columns:/);
});

test('company details are sourced from organization data without hardcoded reference values', () => {
  for (const label of ['Company name', 'Entity type', 'Registration number', 'Industry', 'Company country', 'Country of incorporation', 'Date of incorporation', 'Registered address', 'Tax identification number', 'Website', 'Business activity']) {
    assert.ok(source.includes(`label="${label}"`), `Expected ${label}`);
  }
  for (const field of ['company.legalName', 'company.registrationNumber', 'jurisdiction.countryOfIncorporationName', 'jurisdiction.taxIdentificationNumber', 'jurisdiction.businessActivity', 'jurisdiction.website']) {
    assert.ok(source.includes(field), `Expected backend source ${field}`);
  }
  assert.match(source, /https?:/);
});

test('wallet, identity, transaction and documents retain their functions', () => {
  for (const action of ['copyWalletAddress', 'copyIdentityAddress', 'organizationDocumentService.open', 'identityTransactionHash', 'walletExplorerUrl', 'identityExplorerUrl', 'previewDocument(document, true)', 'previewDocument(document)']) {
    assert.ok(source.includes(action), `Expected preserved action ${action}`);
  }
  assert.match(source, /<details className="org-wallet-card__technical">/);
  assert.match(source, /<summary>View technical details<\/summary>/);
});

test('extra owners and documents can be revealed without dropping records', () => {
  assert.match(source, /ownersExpanded \? owners : owners\.slice\(0, 4\)/);
  assert.match(source, /documentsExpanded \? documents : documents\.slice\(0, 5\)/);
  assert.match(source, /Show all \$\{owners\.length\} owners/);
  assert.match(source, /Show all \$\{documents\.length\} documents/);
});

test('verified page still uses backend status guards and organization hook', () => {
  assert.match(source, /useOrganization\(\)/);
  assert.match(source, /ORGANIZATION_STATUSES\.VERIFIED_SUCCESS_PENDING/);
  assert.match(source, /organization\.status !== ORGANIZATION_STATUSES\.VERIFIED/);
});

test('responsive layout stacks without fixed heights', () => {
  assert.match(styles, /@media \(max-width: 1199px\)/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /\.org-company-field-group/);
  const showcaseRules = styles.match(/\.org-overview-page--reference \.org-overview-showcase\s*\{[^}]+\}/g) || [];
  assert.ok(showcaseRules.length > 0);
  assert.ok(showcaseRules.every((rule) => !/\b(?:min-height|height):\s*\d+px/.test(rule)));
});

test('updated JSX and CSS parse successfully', () => {
  const parsed = ts.createSourceFile(pageFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.equal(parsed.parseDiagnostics.length, 0);
  assert.ok(postcss.parse(styles).nodes.length > 0);
});
