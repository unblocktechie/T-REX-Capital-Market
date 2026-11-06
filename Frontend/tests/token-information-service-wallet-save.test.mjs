import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../src/pages/tokens/TokenInformationPage.jsx', import.meta.url), 'utf8');
const review = await readFile(new URL('../src/pages/tokens/ReviewDeployPage.jsx', import.meta.url), 'utf8');
const details = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const hook = await readFile(new URL('../src/hooks/useOrganization.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/issuer/issuerServiceWallet.service.js', import.meta.url), 'utf8');
const abi = JSON.parse(await readFile(new URL('../src/abi/TREXPlatformController.json', import.meta.url), 'utf8'));

test('token information never registers a Service Wallet before deployment', () => {
  assert.doesNotMatch(page, /registerIssuerServiceWallet|revokeIssuerServiceWallet|syncServiceWallet/);
  assert.match(page, /registered separately for each asset after deployment/);
  assert.doesNotMatch(page, /formData\.append\(['"]serviceWallet/);
});

test('review explains wallet authorization starts after token deployment', () => {
  assert.match(review, /Available after deployment/);
  assert.match(review, /No wallet entered during onboarding is treated as verified authorization/);
  assert.doesNotMatch(review, /organization\?\.serviceWalletAddress/);
});

test('ABI accepts serviceWallet then token, and exposes per-token mapping and indexed event', () => {
  const fn = abi.find((item) => item.name === 'setServiceWallet');
  assert.deepEqual(fn.inputs.map(({ name }) => name), ['serviceWallet', 'token']);
  const getter = abi.find((item) => item.name === 'serviceWalletOf');
  assert.equal(getter.inputs.length, 1);
  const event = abi.find((item) => item.name === 'ServiceWalletUpdated');
  assert.deepEqual(event.inputs.map((item) => [item.name, item.indexed]), [
    ['executor', true], ['token', true], ['oldServiceWallet', false], ['newServiceWallet', true],
  ]);
  assert.match(service, /args: \[serviceWallet, token\]/);
  assert.match(service, /functionName: 'serviceWalletOf', args: \[token\]/);
});

test('token Details signs with Chain Master proxy and scoped token address', () => {
  assert.match(details, /platformControllerAddress: chainController/);
  assert.match(details, /platformControllerAddress: serviceWalletControllerAddress/);
  assert.match(details, /tokenAddress: candidateTokenContractAddress/);
  assert.match(details, /organizationApi\.syncServiceWallet\(registeredAddress, selectedChain\.chainUid, tokenUid\)/);
  assert.match(details, /organizationApi\.syncServiceWallet\(revokedAddress, selectedChain\.chainUid, tokenUid\)/);
  assert.doesNotMatch(details, /organization\.serviceWalletAddress/);
});

test('organization hook updates only token-specific wallets after sync', () => {
  assert.match(hook, /updateTokenServiceWallet\(/);
  assert.doesNotMatch(hook, /serviceWalletAddress: \/\^0x0/);
});

test('MetaMask transaction must confirm before backend sync and retries cannot double sign', () => {
  assert.match(service, /waitForTransactionReceipt/);
  assert.match(service, /receipt.status !== 'success'/);
  assert.match(details, /canRetryBackendSync/);
  assert.match(details, /serviceWalletPendingSyncAddress/);
});
