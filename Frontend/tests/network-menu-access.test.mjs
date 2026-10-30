import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canSelectNetwork,
  canUnlockNetwork,
  getNetworkMenuChoices,
  isNetworkUnlocked,
} from '../src/utils/networkMenu.js';

const unlocked = { chainUid: 'sepolia', chainId: 11155111, identityStatus: 'CREATED', isUnlocked: true };
const locked = { chainUid: 'arbitrum', chainId: 421614, identityStatus: 'LOCKED', isUnlocked: false };
const creating = { chainUid: 'arc', chainId: 5042002, identityStatus: 'CREATING', isUnlocked: false };
const failed = { chainUid: 'robinhood', chainId: 46630, identityStatus: 'FAILED', isUnlocked: false };

test('network menu shows the full access list, including locked chains, even after token lock', () => {
  assert.deepEqual(
    getNetworkMenuChoices([unlocked, locked, creating, failed], [unlocked], unlocked),
    [unlocked, locked, creating, failed],
  );
  assert.deepEqual(getNetworkMenuChoices([], [unlocked], unlocked), [unlocked]);
});

test('only unlocked networks are selectable, and token creation prevents all switching', () => {
  assert.equal(isNetworkUnlocked(unlocked), true);
  assert.equal(isNetworkUnlocked({ chainUid: 'x', identityStatus: 'CREATED' }), true);
  assert.equal(canSelectNetwork(unlocked, false), true);
  assert.equal(canSelectNetwork(locked, false), false);
  assert.equal(canSelectNetwork(creating, false), false);
  assert.equal(canSelectNetwork(unlocked, true), false);
});

test('locked and failed networks can be unlocked/retried when token guard allows it', () => {
  assert.equal(canUnlockNetwork(locked), true);
  assert.equal(canUnlockNetwork(failed), true);
  assert.equal(canUnlockNetwork(unlocked), false);
  assert.equal(canUnlockNetwork(creating), false);
  assert.equal(canUnlockNetwork(locked, { pollingUid: locked.chainUid }), false);
  assert.equal(canUnlockNetwork(locked, { mutationPending: true }), false);
  assert.equal(canUnlockNetwork(locked, { selectionLocked: true }), false);
  assert.equal(canUnlockNetwork(locked, { unlockBlocked: true }), false);
  assert.equal(canUnlockNetwork(locked, { accessLoading: true }), false);
  assert.equal(canUnlockNetwork(locked, { accessError: true }), false);
});

test('sidebar change hides only menu entries; network management remains routable', async () => {
  const sidebar = await readFile(new URL('../src/layouts/components/Sidebar.jsx', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/routes/router.jsx', import.meta.url), 'utf8');
  const switcher = await readFile(new URL('../src/components/common/AppNetworkSwitcher.jsx', import.meta.url), 'utf8');
  assert.match(sidebar, /hiddenSidebarRoutes = new Set\(\[ROUTES\.organization, ROUTES\.chainAccess\]\)/);
  assert.match(sidebar, /!hiddenSidebarRoutes\.has\(item\.to\)/);
  assert.match(router, /path: 'networks', element: withWorkspaceSuspense\(<ChainAccessPage \/>\)/);
  assert.match(switcher, /to=\{ROUTES\.chainAccess\}/);
  assert.match(switcher, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
});
