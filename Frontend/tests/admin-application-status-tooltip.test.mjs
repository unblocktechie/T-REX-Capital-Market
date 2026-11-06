import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/pages/admin/AdminMonitoringListsPage.jsx', import.meta.url), 'utf8');
const tooltip = readFileSync(new URL('../src/components/common/ResponsiveTooltip.jsx', import.meta.url), 'utf8');

const start = source.indexOf('export const APPLICATION_STAGE_HELP');
const end = source.indexOf('function ApplicationStageLabel', start);
const snippet = source.slice(start, end).replaceAll('export const ', 'const ');
const { helps, explain } = vm.runInNewContext(
  `${snippet}\n({ helps: APPLICATION_STAGE_HELP, explain: getApplicationStageHelp })`,
);

test('every defined backend application status has simple and distinct tooltip copy', () => {
  const statuses = ['pending', 'submitIntrest', 'verifiedByIssuer', 'claimSubmitted', 'registered', 'approved', 'rejected', 'cancelled'];
  for (const status of statuses) {
    const message = explain({ status });
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 20, `${status}: missing explanation`);
    assert.doesNotMatch(message, /submitIntrest|verifiedByIssuer|claimSubmitted/);
  }
  assert.equal(Object.keys(helps).length, statuses.length);
});

test('optional resubmission advice appears in the tooltip only for true flags', () => {
  const normal = explain({ status: 'registered', canResubmitClaim: 0 });
  assert.doesNotMatch(normal, /retry/);
  assert.match(explain({ status: 'registered', canResubmitClaim: true }), /retry/);
  assert.match(explain({ status: 'registered', canResubmitClaim: 1 }), /retry/);
});

test('admin applications render exactly one stage chip and keep extra details in tooltip', () => {
  const cell = source.match(/\{ key: 'stage', title: applicationSortHeading\('Current Stage', 'status', sortBy, sortOrder, onSort\), render: \(r\) => ([^\n]+) \},/);
  assert.ok(cell, 'stage column should exist');
  assert.match(cell[1], /<ApplicationStageLabel application=\{r\} \/>/);
  assert.doesNotMatch(cell[1], /display\(r\.stage\)|Needs issuer review|Claim can be resubmitted/);
  const component = source.slice(source.indexOf('function ApplicationStageLabel'), source.indexOf('const INVESTOR_STATUSES'));
  assert.equal((component.match(/<StateChip\b/g) || []).length, 1);
  assert.match(component, /<ResponsiveTooltip/);
  assert.match(component, /ariaLabel=/);
});

test('existing tooltip stays accessible and readable when tables scroll or viewport is narrow', () => {
  assert.match(tooltip, /createPortal/);
  assert.match(tooltip, /onMouseEnter=/);
  assert.match(tooltip, /onFocus=/);
  assert.match(tooltip, /aria-describedby=/);
  assert.match(tooltip, /VIEWPORT_MARGIN/);
});
