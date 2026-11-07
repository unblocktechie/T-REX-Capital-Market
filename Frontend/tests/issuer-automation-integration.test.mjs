import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const organizationApi = await readFile(new URL('../src/api/organization/organization.api.js', import.meta.url), 'utf8');
const endpoints = await readFile(new URL('../src/api/organization/organization.endpoints.js', import.meta.url), 'utf8');
const interceptors = await readFile(new URL('../src/api/axios/interceptors.js', import.meta.url), 'utf8');
const tokenDetails = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/issuer/issuerServiceWallet.service.js', import.meta.url), 'utf8');
const apiKeys = await readFile(new URL('../src/components/issuer/IssuerApiKeysCard.jsx', import.meta.url), 'utf8');
const organizationOverview = await readFile(new URL('../src/pages/organization/OrganizationOverviewPage.jsx', import.meta.url), 'utf8');
const apiKeysPage = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');

const priceUpdateStart = tokenDetails.indexOf('const handlePriceUpdate = async () =>');

test('service wallet registration uses main wallet, Chain Master controller, receipt, then token-scoped backend sync', () => {
  assert.match(tokenDetails, /chainsApi\.listPublic\(\)/);
  assert.match(tokenDetails, /wallet\.switchChain\(selectedChain\.chainId\)/);
  assert.match(tokenDetails, /registerIssuerServiceWallet\([\s\S]*?issuerWalletAddress[\s\S]*?platformControllerAddress: chainController/);
  assert.match(service, /functionName: 'setServiceWallet'/);
  assert.match(service, /waitForTransactionReceipt/);
  assert.match(tokenDetails, /organizationApi\.syncServiceWallet\(registeredAddress, selectedChain\.chainUid, tokenUid\)/);
  assert.match(tokenDetails, /revokeIssuerServiceWallet/);
  assert.match(tokenDetails, /SERVICE_WALLET_ZERO_ADDRESS/);
  assert.ok(tokenDetails.indexOf('organizationApi.syncServiceWallet') < priceUpdateStart);
});

test('service wallet sync is explicitly chain scoped and mismatch errors are supported', async () => {
  const errors = await readFile(new URL('../src/utils/error.js', import.meta.url), 'utf8');
  assert.match(endpoints, /serviceWallet: '\/organizations\/me\/service-wallet'/);
  assert.match(organizationApi, /syncServiceWallet: \(serviceWalletAddress, chainUid, tokenUid\)/);
  assert.match(organizationApi, /headers: chainUid \? \{ 'X-Chain-Uid': chainUid \}/);
  assert.match(errors, /SERVICE_WALLET_ONCHAIN_MISMATCH/);
  assert.match(errors, /SELECTED_CHAIN_MISMATCH/);
});

test('issuer API-key management is JWT-only and skips the selected-chain header', () => {
  assert.match(endpoints, /apiKeys: '\/organizations\/me\/api-keys'/);
  assert.match(organizationApi, /listApiKeys:[\s\S]*?skipSelectedChainHeader: true/);
  assert.match(organizationApi, /createApiKey:[\s\S]*?skipSelectedChainHeader: true/);
  assert.match(organizationApi, /rotateApiKey:[\s\S]*?skipSelectedChainHeader: true/);
  assert.match(organizationApi, /revokeApiKey:[\s\S]*?skipSelectedChainHeader: true/);
  assert.match(interceptors, /!config\.skipSelectedChainHeader/);
});

test('API key UI shows plaintext once without browser persistence and supports create replace disable', () => {
  assert.doesNotMatch(organizationOverview, /IssuerApiKeysCard/);
  assert.match(organizationOverview, /OrganizationSummaryHeader/);
  assert.match(organizationOverview, /org-overview-lower-grid/);
  assert.match(apiKeysPage, /<IssuerApiKeysCard policyOptionsQuery=/);
  assert.match(apiKeys, /Create API key/);
  assert.match(apiKeys, /Replace key/);
  assert.match(apiKeys, /Disable key/);
  assert.match(apiKeys, /dismissible=\{false\}/);
  assert.match(apiKeys, /shown only once/i);
  assert.match(apiKeys, /navigator\.clipboard\.writeText\(secret\)/);
  assert.match(apiKeys, /new Blob/);
  assert.doesNotMatch(apiKeys, /localStorage|sessionStorage/);
  assert.doesNotMatch(apiKeys, /issuer-api-key-row__scopes/);
  assert.doesNotMatch(apiKeysPage, /Your backend uses an API key to/);
});

test('Service Wallet and API-key lifecycle remain independent', () => {
  assert.match(tokenDetails, /Manual updates and API keys are unchanged/);
  assert.match(apiKeys, /Service Wallet authorization is managed independently on-chain/);
});

test('existing manual price update flow remains present and separate', () => {
  assert.match(tokenDetails, /const handlePriceUpdate = async \(\) =>/);
  assert.match(tokenDetails, /sendPreparedManualPriceTransaction\(/);
  assert.match(tokenDetails, /prepareManualPrice\(submittedPrice, tokenChainUid\)/);
  assert.match(tokenDetails, /runPriceVerification\(broadcast\)/);
  assert.match(tokenDetails, /title="Update Price"/);
});
