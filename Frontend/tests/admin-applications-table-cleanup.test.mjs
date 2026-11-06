import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lists = readFileSync(new URL('../src/pages/admin/AdminMonitoringListsPage.jsx', import.meta.url), 'utf8');
const parts = readFileSync(new URL('../src/components/admin/AdminMonitoringParts.jsx', import.meta.url), 'utf8');

const applicationCols = lists.slice(lists.indexOf('const getApplicationColumns = '), lists.indexOf('// Use a keyed inner component'));

test('application list separates Issuer and Token while preserving History and read-only actions', () => {
  assert.deepEqual(Array.from(applicationCols.matchAll(/applicationSortHeading\('([^']+)'/g), (m) => m[1]),
    ['Investor', 'Issuer', 'Token', 'Network', 'Current Stage', 'Submitted']);
  assert.match(applicationCols, /key: 'history', title: 'HISTORY'/);
  assert.doesNotMatch(applicationCols, /Decision|rejectReason|r\.note/);
});

test('optional UID fields are removed from the platform tokens and applications UI', () => {
  assert.doesNotMatch(lists, /Filter by organization UID/);
  assert.doesNotMatch(lists, /Filter by token UID/);
  assert.match(lists, /<ListTools search=\{search\}/);
});

test('applications and tokens do not send hidden UID filters to the backend', () => {
  assert.doesNotMatch(lists, /debouncedOrganizationUid|debouncedTokenUid/);
  assert.doesNotMatch(lists, /pendingOnly|setPendingOnly|Awaiting issuer review only/);
  assert.match(lists, /adminMonitoringApi\.listApplications\(params\)/);
  assert.match(lists, /adminMonitoringApi\.listTokens\(params\)/);
});

test('stage badges capitalize their first letter but preserve the original status for styling', () => {
  const component = lists.slice(lists.indexOf('function ApplicationStageLabel'), lists.indexOf('const INVESTOR_STATUSES'));
  assert.match(component, /statusLabel\.charAt\(0\)\.toUpperCase\(\)/);
  assert.match(component, /<StateChip value=\{application\.status\} label=\{displayLabel\} \/>/);
  assert.match(parts, /export function StateChip\(\{ value, label \}\)/);
  assert.match(parts, /label \?\? formatStatus\(value\)/);
});
