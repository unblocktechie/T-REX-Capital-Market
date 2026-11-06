import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterOrganizationsByQuery } from '../src/utils/adminOrganizationSearch.js';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const shared = read('components/admin/AdminOrganizationList.jsx');
const compactAddress = read('components/common/CompactAddress.jsx');
const investor = read('pages/admin/AdminInvestorDetailPage.jsx');

const organizations = [
  { name: 'Barron Jenkins Associates', registrationNumber: '939', wallet: { address: '0xAAA111AbC' } },
  { name: 'Chase Montgomery LLC', registrationNumber: '880', wallet: { address: '0xBBB222DeF' } },
  { name: 'No Wallet LLC', registrationNumber: '001', wallet: null },
];

test('unified search matches names, registration numbers and wallet addresses case-insensitively', () => {
  assert.deepEqual(filterOrganizationsByQuery(organizations, ' barron '), [organizations[0]]);
  assert.deepEqual(filterOrganizationsByQuery(organizations, '880'), [organizations[1]]);
  assert.deepEqual(filterOrganizationsByQuery(organizations, '0xaaa111abc'), [organizations[0]]);
  assert.deepEqual(filterOrganizationsByQuery(organizations, '0xbbb222def'), [organizations[1]]);
  assert.deepEqual(filterOrganizationsByQuery(organizations, ''), organizations);
  assert.deepEqual(filterOrganizationsByQuery(organizations, 'never found'), []);
});

test('both pages have only one search field and no separate wallet search or filter headings', () => {
  assert.equal((shared.match(/type="search"/g) || []).length, 1);
  assert.doesNotMatch(shared, /walletSearch|onWalletSearchChange|ColumnLabel|Filter wallet address|Newest first<\/span>/);
  assert.match(shared, /Search organization, registration number or wallet address/);
  for (const path of ['pages/admin/ReviewQueuePage.jsx', 'pages/admin/AdminOrganizationsPage.jsx']) {
    const source = read(path);
    assert.match(source, /filterOrganizationsByQuery\(/);
    assert.doesNotMatch(source, /walletSearch|onWalletSearchChange/);
    assert.match(source, /sortDirection: filters\.sortBy === 'submittedAt' \? filters\.sortDirection : 'desc'/);
  }
});

test('organization, submitted and status use the same directional sort styling as investors', () => {
  assert.match(shared, /aria-sort=\{onSortChange/);
  assert.match(shared, /onClick=\{\(\) => onSortChange\(field\)\}/);
  assert.match(shared, /aria-label=\{`Sort by \$\{label\.toLowerCase\(\)\}:/);
  assert.match(shared, /<ArrowUpDown className="size-3\.5 text-slate-400"/);
  assert.match(shared, /<ArrowUp className=/);
  assert.match(shared, /<ArrowDown className=/);
  assert.match(shared, /overflow-x-auto/);
});

test('investor profile wallet retains full address and uses existing copy behavior', () => {
  assert.match(investor, /<DataField label="Wallet address" value=\{value\('walletAddress'\)\} copyable\s*\/>/);
  assert.match(investor, /<CompactAddress value=\{value\} label=\{label\} showFull/);
  assert.match(compactAddress, /showFull \? value : shortenWalletAddress/);
  assert.match(compactAddress, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(compactAddress, /if \(!completed\) copyFallback\(value\)/);
});
