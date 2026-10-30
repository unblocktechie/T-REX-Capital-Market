import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mapIssuerInvestor } from '../src/api/investments/invitation.mapper.js';

const source = readFileSync(new URL('../src/pages/issuer/IssuerInvestorDirectoryPage.jsx', import.meta.url), 'utf8');

test('investor API mapper preserves the investmentInterest registration status for the selected token', () => {
  const investor = mapIssuerInvestor({
    investorUid: 'investor-1',
    eligibleForInvitation: false,
    investmentInterest: { interestUid: 'interest-1', status: 'registered' },
  });
  assert.equal(investor.investmentInterest.status, 'registered');
  assert.equal(investor.eligibleForInvitation, false);
});

test('registered application takes precedence over the unavailable and invite states', () => {
  const actionColumn = source.split("key: 'actions'")[1].split('const currentPage =')[0];
  const registeredCheck = actionColumn.indexOf("investor?.investmentInterest?.status || ''");
  const eligibleCheck = actionColumn.indexOf('!investor?.eligibleForInvitation');
  assert.ok(registeredCheck > -1, 'action column checks investment interest status');
  assert.ok(eligibleCheck > registeredCheck, 'registration check happens before invitation eligibility');
  assert.match(actionColumn, /\.toLowerCase\(\) === 'registered'/);
  assert.match(actionColumn, /app-status-badge--success[^"]*">Registered<\/span>/);
  assert.match(actionColumn, /Invitation unavailable/);
  assert.match(actionColumn, /const action = inviteAction/);
});

test('existing five-row pagination and invitation handling remain unchanged', () => {
  assert.match(source, /const PAGE_SIZE = 5;/);
  assert.match(source, /invitationStatus: status/);
  assert.match(source, /onClick=\{\(\) => handleInvite\(investor\)\}/);
  assert.match(source, /<InvestorHistoryPagination/);
});
