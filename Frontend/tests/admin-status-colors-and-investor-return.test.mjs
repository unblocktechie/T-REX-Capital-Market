import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const parts = read('src/components/admin/AdminMonitoringParts.jsx');
const lists = read('src/pages/admin/AdminMonitoringListsPage.jsx');
const detail = read('src/pages/admin/AdminInvestorDetailPage.jsx');

// Exercise the same class-selection statements used by StateChip without a JSX runtime.
const chipSource = parts.slice(parts.indexOf('  const status = String(value ||'), parts.indexOf('  return <span', parts.indexOf('export function StateChip')));
const classFor = vm.runInNewContext(`(value) => { ${chipSource} return color; }`);

test('profile status chips distinguish not started, draft, and submitted', () => {
  assert.match(classFor('Not started'), /bg-slate-50/);
  assert.match(classFor('Draft'), /bg-amber-50/);
  assert.match(classFor('Submitted'), /bg-blue-50/);
  assert.notEqual(classFor('Not started'), classFor('Draft'));
  assert.notEqual(classFor('Draft'), classFor('Submitted'));
});

test('token lifecycle stage colors indicate success, progress, and failure', () => {
  assert.match(classFor('Deployed'), /bg-emerald-50/);
  assert.match(classFor('Active'), /bg-emerald-50/);
  assert.match(classFor('Deploying'), /bg-blue-50/);
  assert.match(classFor('Pending'), /bg-amber-50/);
  assert.match(classFor('Failed'), /bg-rose-50/);
  assert.match(classFor('Paused'), /bg-slate-50/);
});

test('Platform Tokens moves Investors after Created without removing its dialog action', () => {
  const cols = lists.slice(lists.indexOf('const getTokenColumns'), lists.indexOf('const getApplicationColumns'));
  const created = cols.indexOf("key: 'created'");
  const investors = cols.indexOf("key: 'investors'");
  assert.ok(created > 0 && investors > created);
  assert.match(cols, /onViewToken\(r\.tokenUid\)/);
  assert.match(cols, /key: 'status'/);
});

test('Investor Applications passes an explicit source when navigating to Investor Details', () => {
  const cols = lists.slice(lists.indexOf('const getApplicationColumns'), lists.indexOf('// Use a keyed inner component'));
  assert.match(cols, /to=\{ROUTES\.adminInvestor\(r\.investorUserUid\)\} state=\{\{ from: ROUTES\.adminInvestorApplications \}\}/);
  assert.match(detail, /useLocation\(\)/);
  assert.match(detail, /location\.state\?\.from === ROUTES\.adminInvestorApplications/);
  assert.match(detail, /fromApplications \? ROUTES\.adminInvestorApplications : ROUTES\.adminInvestors/);
  assert.match(detail, /to=\{backRoute\}/);
  assert.match(detail, /Back to investor applications/);
  assert.match(detail, /Back to investors/);
});
