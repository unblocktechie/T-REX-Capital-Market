import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { filterIssuerRequestsByStatus, issuerRequestApiStatus } from '../src/utils/issuerRequestStatusFilter.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const request = (status, progress = {}) => ({ status, ...progress });
const requests = [
  request('registered'),
  request('verifiedByIssuer', { issuerVerificationConfirmed: true, registryRegistrationConfirmed: true, claimsConfirmed: false, canInvest: false, journeyStage: 'AWAITING_INVESTOR_CLAIMS' }),
  request('registered', { canInvest: false, journeyStage: 'AWAITING_INVESTOR_CLAIMS' }),
  request('claimSubmitted', { canInvest: true, journeyStage: 'COMPLETED' }),
  request('rejected'),
  request('cancelled'),
];

test('Completed maps to the supported All Requests API filter, without adding a new backend status', () => {
  assert.equal(issuerRequestApiStatus('completed'), 'all');
  for (const status of ['all', 'submitIntrest', 'verifiedByIssuer', 'pending', 'approved', 'rejected']) {
    assert.equal(issuerRequestApiStatus(status), status);
  }
});

test('Completed matches confirmed registrations and completed legacy/flagged applications, not pending or cancelled requests', () => {
  assert.deepEqual(filterIssuerRequestsByStatus(requests, 'completed'), [requests[0], requests[3]]);
  assert.strictEqual(filterIssuerRequestsByStatus(requests, 'all'), requests);
  assert.strictEqual(filterIssuerRequestsByStatus(requests, 'rejected'), requests);
  assert.deepEqual(filterIssuerRequestsByStatus([], 'completed'), []);
});

test('Issuer Investment Requests dropdown shows Completed but not Cancelled', async () => {
  const page = await read('../src/pages/issuer/IssuerInvestorsPage.jsx');
  const options = page.split('const INTEREST_STATUS_OPTIONS = [')[1].split('];')[0];
  assert.match(options, /value: 'completed', label: 'Completed'/);
  assert.doesNotMatch(options, /value: 'cancelled'/);
  assert.match(page, /issuerRequestApiStatus\(statusFilter\)/);
  assert.match(page, /filterIssuerRequestsByStatus\(requests, statusFilter\)/);
  assert.match(page, /const rows = statusFilteredRequests\.map/);
  assert.match(page, /disabled=\{!statusFilteredRequests\.length\}/);
});
