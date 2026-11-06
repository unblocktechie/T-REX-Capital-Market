import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortAdminOrganizationsPage } from '../src/utils/adminOrganizationSort.js';

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
const table = read('components/admin/AdminOrganizationList.jsx');
const detail = read('pages/admin/OrganizationReviewPage.jsx');
const pages = [read('pages/admin/ReviewQueuePage.jsx'), read('pages/admin/AdminOrganizationsPage.jsx')];
const rows = [
  { id: '2', name: 'Bravo 10', status: 'submitted' },
  { id: '1', name: 'alpha', status: 'approved' },
  { id: '3', name: 'Bravo 2', status: 'rejected' },
  { id: '4', name: '', status: '' },
];

test('organization names use numeric-aware, case-insensitive A-Z/Z-A sorting without mutating fetched data', () => {
  assert.deepEqual(sortAdminOrganizationsPage(rows, 'name', 'asc').map((r) => r.id), ['1', '3', '2', '4']);
  assert.deepEqual(sortAdminOrganizationsPage(rows, 'name', 'desc').map((r) => r.id), ['2', '3', '1', '4']);
  assert.deepEqual(rows.map((r) => r.id), ['2', '1', '3', '4']);
});

test('statuses sort in either direction, keeping empty statuses last', () => {
  assert.deepEqual(sortAdminOrganizationsPage(rows, 'status', 'asc').map((r) => r.id), ['1', '3', '2', '4']);
  assert.deepEqual(sortAdminOrganizationsPage(rows, 'status', 'desc').map((r) => r.id), ['2', '3', '1', '4']);
  assert.strictEqual(sortAdminOrganizationsPage(rows, 'submittedAt', 'asc'), rows);
});

test('both admin tables expose the three sort controls with accessible direction hints', () => {
  for (const [heading, key] of [['Organization', 'name'], ['Submitted', 'submittedAt'], ['Status', 'status']]) {
    assert.match(table, new RegExp(`SortableOrganizationHeading label="${heading}" field="${key}"`));
  }
  assert.match(table, /aria-sort=\{onSortChange/);
  assert.match(table, /aria-label=\{`Sort by \$\{label\.toLowerCase\(\)\}/);
  assert.match(table, /rounded-full bg-gradient-to-br/);
  for (const page of pages) {
    assert.match(page, /sortAdminOrganizationsPage\(/);
    assert.match(page, /onSortChange=\{changeSort\}/);
    assert.match(page, /sortDirection: filters\.sortBy === 'submittedAt' \? filters\.sortDirection : 'desc'/);
    assert.match(page, /sortBy: 'submittedAt'/);
    assert.match(page, /sortBy: column/);
  }
});

test('organization detail displays circular initials, trailing status, and scrolls to the top on opening', () => {
  assert.match(detail, /useLayoutEffect\(\(\) => \{\s*window\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant' \}\);\s*\}, \[organizationId\]\)/);
  assert.match(detail, /rounded-full bg-gradient-to-br/);
  assert.match(detail, /<div className="shrink-0 self-end sm:ml-4 sm:self-start" aria-label="Organization review status">/);
  assert.match(detail, /<AdminStatusBadge status=\{organization.status\} \/>/);
});
