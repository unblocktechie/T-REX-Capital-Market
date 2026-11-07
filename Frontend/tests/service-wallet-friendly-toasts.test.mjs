import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url),
  'utf8',
);

test('Service Wallet registration shows a clear success toast after token-specific verification', () => {
  assert.match(
    page,
    /organizationApi\.syncServiceWallet\(registeredAddress, selectedChain\.chainUid, tokenUid\)[\s\S]*?toast\.success\('Service Wallet connected', \{\s*description: "This wallet can now be used to update this token's price automatically\."/,
  );
});

test('Service Wallet removal uses clear copy after synchronization without changing manual updates or keys', () => {
  assert.match(
    page,
    /organizationApi\.syncServiceWallet\(revokedAddress, selectedChain\.chainUid, tokenUid\)[\s\S]*?toast\.success\('Wallet access removed', \{\s*description: 'Automatic updates are off for this token\. Manual updates and API keys are unchanged\.'/,
  );
});

test('old technical success messages are not shown to users', () => {
  assert.doesNotMatch(page, /The on-chain registration and this asset are synchronized\./);
  assert.doesNotMatch(page, /The on-chain authorization was removed\. Existing issuer API keys were not changed\./);
});
