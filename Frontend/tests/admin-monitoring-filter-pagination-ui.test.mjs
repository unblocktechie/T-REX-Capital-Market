import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const parts = readFileSync(new URL('../src/components/admin/AdminMonitoringParts.jsx', import.meta.url), 'utf8');
const filterStyle = readFileSync(new URL('../src/assets/styles/admin-monitoring.css', import.meta.url), 'utf8');
const dropdown = readFileSync(new URL('../src/components/investor-marketplace/MarketplaceDropdown.jsx', import.meta.url), 'utf8');
const lists = readFileSync(new URL('../src/pages/admin/AdminMonitoringListsPage.jsx', import.meta.url), 'utf8');

test('status and network filters use existing accessible styled listboxes without changing API values', () => {
  assert.match(parts, /MarketplaceDropdown/);
  assert.match(parts, /ariaLabel="Filter by status"/);
  assert.match(parts, /ariaLabel="Filter by network"/);
  assert.match(parts, /value=\{status\}/);
  assert.match(parts, /value=\{chainUid\}/);
  assert.match(parts, /onChange=\{onStatus\}/);
  assert.match(parts, /onChange=\{onChain\}/);
  assert.match(parts, /\{ value: 'all', label: 'All statuses' \}/);
  assert.match(parts, /\{ value: '', label: 'All networks' \}/);
  assert.match(parts, /portal/);
  assert.doesNotMatch(parts, /<select/);
  assert.match(lists, /setPage\(1\)/);
});

test('dropdowns retain keyboard, pointer-outside, and constrained viewport handling', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Escape', 'Home', 'End']) assert.ok(dropdown.includes(key));
  assert.match(dropdown, /role="listbox"/);
  assert.match(dropdown, /aria-selected=\{isSelected\}/);
  assert.match(dropdown, /createPortal\(menu, document\.body\)/);
  assert.match(dropdown, /window\.addEventListener\('resize'/);
  assert.match(dropdown, /window\.addEventListener\('scroll'/);
  assert.match(filterStyle, /maxHeight|overflow-y: auto/);
  assert.match(filterStyle, /:focus-visible/);
  assert.match(filterStyle, /prefers-reduced-motion/);
});

test('pagination keeps all pages reachable, shows current page and neighbors on narrow screens', () => {
  assert.match(parts, /firstPage = Math\.max\(1/);
  assert.match(parts, /Math\.min\(totalPages, 5\)/);
  assert.match(parts, /Math\.abs\(p - page\) > 1/);
  assert.match(parts, /hidden sm:inline-flex/);
  assert.match(parts, /aria-current=\{p === page \? 'page' : undefined\}/);
  assert.match(parts, /aria-label="Results pages"/);
  assert.match(parts, /pending \|\| page <= 1/);
  assert.match(parts, /pending \|\| page >= totalPages/);
  assert.match(parts, /onChange\(page - 1\)/);
  assert.match(parts, /onChange\(page \+ 1\)/);
  assert.match(parts, /flex-wrap/);
});

test('numbered pagination buttons remain square despite the global min-width reset', () => {
  assert.match(parts, /className=\{`admin-monitor-pagination__page \$\{buttonClass\}/);
  assert.match(filterStyle, /button\.admin-monitor-pagination__page\s*\{/);
  assert.match(filterStyle, /min-width:\s*44px/);
  assert.match(filterStyle, /width:\s*44px/);
  assert.match(filterStyle, /flex:\s*0 0 44px/);
  assert.match(filterStyle, /height:\s*44px/);
  assert.match(filterStyle, /justify-content:\s*center/);
  assert.match(parts, /aria-current=\{p === page \? 'page' : undefined\}/);
});
