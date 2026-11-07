import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dialogs = readFileSync(new URL('../src/components/admin/AdminMonitoringDetailDialogs.jsx', import.meta.url), 'utf8');
const tokenDialog = dialogs.slice(dialogs.indexOf('export function AdminTokenDetailsDialog'), dialogs.indexOf('const sortEvents'));
const timelineDialog = dialogs.slice(dialogs.indexOf('export function AdminApplicationHistoryDialog'));

test('token investors dialog explicitly overrides narrow default modal width, without altering application timeline', () => {
  assert.match(tokenDialog, /className="h-\[92dvh\] sm:max-w-\[1200px\]" dialogStyle=\{\{ maxWidth: '1200px' \}\}/);
  assert.match(tokenDialog, /bodyClassName="min-w-0 space-y-4 px-4 py-5 sm:px-6 lg:px-8"/);
  assert.match(timelineDialog, /dialogStyle=\{\{ maxWidth: '960px' \}\}/);
});

test('investor and price-history tabs keep the same viewport-responsive dialog height with internal scrolling', () => {
  const sharedModal = readFileSync(new URL('../src/components/ui/Modal.jsx', import.meta.url), 'utf8');
  assert.match(tokenDialog, /className="h-\[92dvh\] sm:max-w-\[1200px\]"/);
  assert.match(sharedModal, /max-h-\[92dvh\]/);
  assert.match(sharedModal, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(tokenDialog, /tab === 'investors'/);
  assert.match(tokenDialog, /<AdminTokenPriceHistory token=\{token\}/);
});

test('small screens show complete investor cards and desktop screens show a fully readable table', () => {
  assert.match(tokenDialog, /lg:hidden" aria-label="Invested investors"/);
  assert.match(tokenDialog, /hidden min-w-0 overflow-x-auto rounded-xl border border-slate-200 lg:block/);
  assert.match(tokenDialog, /min-w-\[860px\] table-fixed/);
  assert.match(tokenDialog, /<AdminAddressPill value=\{investor.walletAddress\}/);
  for (const column of ['Investor', 'Wallet', 'Accreditation', 'Current Balance', 'Holding Status']) {
    assert.match(tokenDialog, column === 'Wallet' ? /<th[^>]*>Wallet<|<dt[^>]*>Wallet</ : new RegExp(column === 'Investor' ? `modalSortHeading\\('Investor'` : column === 'Accreditation' ? `modalSortHeading\\('Accreditation'` : column === 'Current Balance' ? `modalSortHeading\\('Current balance'` : `modalSortHeading\\('Holding status'`));
  }
});

test('token dialog keeps search, backend pagination, token tabs, and status styling', () => {
  assert.match(tokenDialog, /useDebounce\(search, 350\)/);
  assert.match(tokenDialog, /adminMonitoringApi\.getTokenDetails\(tokenUid, \{ page, limit: INVESTOR_LIMIT, search: debouncedSearch, holderStatus \}\)/);
  assert.match(tokenDialog, /<TokenInvestorsPagination pagination=\{pagination\}/);
  assert.match(tokenDialog, /<TokenOverview token={token} chains={chains} paymentSymbol={paymentSymbol}/);
  assert.doesNotMatch(tokenDialog, /tab === 'details'/);
  assert.match(tokenDialog, /capitalizeStatusOption\(investor\.accreditationType\)/);
});
