import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { issuerInitials, sortAdminInvestorTokenPage, sortAdminInvestorApplicationPage } from '../src/utils/adminInvestorSort.js';

const source = readFileSync(new URL('../src/pages/admin/AdminInvestorDetailPage.jsx', import.meta.url), 'utf8');
const tableColumns = (name, next) => source.split(`  ${name}: [`)[1]?.split(next)[0] || '';

test('issuer is first in both Investor Details activity tabs without losing existing columns', () => {
  const invested = tableColumns('investedTokens', '  applications: [');
  const applications = tableColumns('applications', '\n};');
  assert.deepEqual([...invested.matchAll(/key: '([^']+)'/g)].map((m) => m[1]), ['issuer', 'token', 'address', 'chain', 'price']);
  assert.deepEqual([...applications.matchAll(/key: '([^']+)'/g)].map((m) => m[1]), ['issuer', 'token', 'chain', 'stage', 'submitted']);
  assert.match(source, /applicationHistoryColumn\(openApplicationHistory\)/);
});

test('issuer avatars match Organizations first-two-word initials and remain noninteractive', () => {
  assert.equal(issuerInitials('Barron Jenkins Associates'), 'BJ');
  assert.equal(issuerInitials('Chase Montgomery LLC'), 'CM');
  assert.equal(issuerInitials('Burton and Sparks Inc'), 'BA');
  assert.equal(issuerInitials(''), 'OR');
  assert.match(source, /rounded-full bg-gradient-to-br from-slate-950 to-slate-700/);
  assert.match(source, /aria-hidden="true" className="grid size-10/);
  assert.match(source, /\{issuerInitials\(name\)\}/);
});

test('issuer links and sort actions are retained for both tabs', () => {
  assert.match(source, /ROUTES\.adminOrganizationReview\(uid\)/);
  assert.match(source, /state=\{\{ from: location\.pathname, backState: \{ tab: sourceTab, page \} \}\}/);
  assert.match(source, /column\.key === 'issuer' \? \{ render: \(row\) => issuerLink\(row, tabKey\) \}/);
  assert.equal(sortAdminInvestorTokenPage([{ legalCompanyName: 'Z' }, { legalCompanyName: 'A' }], 'issuerName', 'asc')[0].legalCompanyName, 'A');
  assert.equal(sortAdminInvestorApplicationPage([{ issuerName: 'Z' }, { issuerName: 'A' }], 'issuerName', 'asc')[0].issuerName, 'A');
});
