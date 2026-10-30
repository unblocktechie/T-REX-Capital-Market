import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [modalSource, serviceSource, lifecycleSource, pageSource, mainLayoutSource] = await Promise.all([
  readFile(new URL('../src/components/wallet/UsdcBridgeModal.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/wallet/usdcBridge.service.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/wallet/usdcBridgeLifecycle.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/wallet/WalletManagementPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
]);

test('bridge modal stays locked for the entire multi-transaction wallet flow', () => {
  assert.match(modalSource, /const bridgeInFlightRef = useRef\(false\)/);
  assert.match(modalSource, /bridgeInFlightRef\.current = true;[\s\S]*executeUsdcBridgeSession/);
  assert.match(modalSource, /const safeClose = \(\) => \{ if \(!bridgeInFlightRef\.current && !bridging\) onClose\?\.\(\); \};/);
});

test('bridge completion is emitted only after the final Circle result is complete', () => {
  assert.match(modalSource, /if \(!isUsdcBridgeResultComplete\(bridgeResult\)\)/);
  assert.match(modalSource, /await onBridgeCompleted\?\.\(\{ result: bridgeResult, route, amount: clean\(amount\) \}\)/);
  assert.match(lifecycleSource, /export const isUsdcBridgeResultComplete/);
  assert.match(serviceSource, /FINAL_MINT_EVENT_TIMEOUT_MS/);
  assert.match(serviceSource, /await Promise\.race\(\[finalMintEvent, timeout\]\)/);
});

test('Circle fetchAttestation events map to the visible attestation progress step', () => {
  assert.match(lifecycleSource, /if \(\/attestation\/\.test\(raw\)\) return 'attestation';/);
  assert.match(modalSource, /id: 'attestation'/);
});

test('wallet focus refetches cannot remove an in-progress bridge modal', () => {
  assert.match(pageSource, /setBridgeRoutesSnapshot\(bridgeRoutes\)/);
  assert.match(pageSource, /<UsdcBridgeModal open=\{bridgeOpen\}/);
  assert.match(pageSource, /routes=\{bridgeRoutesSnapshot\.length \? bridgeRoutesSnapshot : bridgeRoutes\}/);
});

test('successful bridge keeps the terminal result visible until the user closes it', () => {
  const completionHandler = pageSource.slice(
    pageSource.indexOf('const handleBridgeCompleted'),
    pageSource.indexOf('return (', pageSource.indexOf('const handleBridgeCompleted')),
  );
  assert.doesNotMatch(completionHandler, /setBridgeOpen\(false\)/);
  assert.match(pageSource, /toast\.success\('Bridge completed'/);
  assert.match(pageSource, /void Promise\.allSettled\(\[nativeQuery\.refetch\(\), configuredAssetsQuery\.refetch\(\), roleAssetsQuery\.refetch\(\)\]\)/);
  assert.match(modalSource, /stage === 'success'[\s\S]*onClick=\{safeClose\}>Close<\/Button>/);
});

test('mainnet wallet chain changes cannot remount wallet management during a bridge', () => {
  assert.match(mainLayoutSource, /location\.pathname === ROUTES\.walletManagement/);
  assert.match(mainLayoutSource, /\? 'wallet-management'/);
  assert.match(mainLayoutSource, /<Outlet key=\{outletKey\} \/>/);
});
