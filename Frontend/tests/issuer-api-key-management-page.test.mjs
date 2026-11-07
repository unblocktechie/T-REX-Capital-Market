import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile(new URL('../src/config/routes.js', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../src/config/navigation.js', import.meta.url), 'utf8');
const router = await readFile(new URL('../src/routes/router.jsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
const apiKeys = await readFile(new URL('../src/components/issuer/IssuerApiKeysCard.jsx', import.meta.url), 'utf8');
const priceUpdates = await readFile(new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url), 'utf8');
const tokenCss = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');
const organizationCss = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');

test('issuer API key management keeps its dedicated route without a sidebar entry', () => {
  assert.match(routes, /issuerApiKeys: '\/app\/api-keys'/);
  assert.match(router, /const IssuerApiKeysPage = lazy/);
  assert.match(router, /path: 'api-keys'.*?<IssuerApiKeysPage/s);
  assert.doesNotMatch(navigation, /label: 'Bot Configuration'/);
  assert.match(navigation, /\[ROUTES\.issuerApiKeys\]: \{ title: 'Bot Configuration'/);
});

test('dedicated page explains independent validation layers and reuses full key management UI', () => {
  assert.match(page, /API Key Management/);
  assert.match(page, /Complete the required bot setup/);
  assert.match(page, /Network Security/);
  assert.match(page, /Price Protection/);
  assert.match(page, /Update Schedule/);
  assert.match(page, /API key/);
  assert.match(page, /Service Wallet/);
  assert.match(page, /<IssuerApiKeysCard policyOptionsQuery=/);
  assert.match(apiKeys, /Create API key/);
  assert.match(apiKeys, /Replace key/);
  assert.match(apiKeys, /Disable key/);
});

test('service wallet section links to Bot Configuration and retains wallet editing', () => {
  assert.match(priceUpdates, /Configure Bot/);
  assert.match(priceUpdates, /Remove Wallet Access/);
  assert.match(priceUpdates, /onClick=\{onServiceWalletRevoke\}/);
  assert.match(priceUpdates, /to=\{botConfigurationLink\}/);
  assert.match(priceUpdates, /onClick=\{beginServiceWalletChange\}/);
  assert.match(priceUpdates, /Save New Service Wallet/);
  assert.match(priceUpdates, /onClick=\{cancelServiceWalletChange\}/);
  assert.match(tokenCss, /\.price-updates-service-wallet__change-button/);
  assert.match(tokenCss, /\.price-updates-service-wallet__actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?gap: 10px/);
  assert.match(tokenCss, /\.price-updates-service-wallet__current-status \{[\s\S]*?display: flex;[\s\S]*?width: 100%;/);
  assert.match(tokenCss, /\.price-updates-service-wallet__buttons \{[\s\S]*?width: 100%;[\s\S]*?justify-content: flex-end;/);
});

test('API key management page and service wallet controls include responsive layouts', () => {
  assert.match(organizationCss, /@media \(max-width: 900px\)[\s\S]*?\.issuer-api-keys-page__layers/);
  assert.match(organizationCss, /@media \(max-width: 620px\)[\s\S]*?\.issuer-api-keys-page/);
  assert.match(tokenCss, /@media \(max-width: 760px\)[\s\S]*?\.price-updates-api-key-note__content/);
  assert.match(tokenCss, /@media \(max-width: 480px\)[\s\S]*?\.price-updates-service-wallet__buttons/);
});


test('API key expiry input is limited to 1 through 365 days and three digits', () => {
  assert.match(apiKeys, /slice\(0, 3\)/);
  assert.match(apiKeys, /days < 1 \|\| days > 365/);
  assert.match(apiKeys, /setExpiresInDays\('365'\)/);
  assert.match(apiKeys, /setExpiresInDays\('1'\)/);
  assert.match(apiKeys, /maxLength=\{3\}/);
  assert.match(apiKeys, /pattern="\[0-9\]\*"/);
  assert.match(apiKeys, /Enter a whole number from 1 to 365 days/);
});


test('API key capacity uses backend meta and create CTA can wrap cleanly on narrower layouts', async () => {
  const organizationApi = await readFile(new URL('../src/api/organization/organization.api.js', import.meta.url), 'utf8');
  assert.match(organizationApi, /listApiKeys:[\s\S]*?then\(unwrapEnvelope\)/);
  assert.match(apiKeys, /payload\?\.meta/);
  assert.match(apiKeys, /meta\.activeKeyCount/);
  assert.match(apiKeys, /meta\.maxActiveKeys/);
  assert.match(apiKeys, /meta\.remainingSlots/);
  assert.match(apiKeys, /of \${capacity\.maxActiveKeys} active/);
  assert.match(organizationCss, /\.issuer-api-keys-card__header \{[\s\S]*?flex-wrap: wrap/);
  assert.match(organizationCss, /\.issuer-api-keys-card__title \{[\s\S]*?flex: 1 1 600px/);
  assert.match(organizationCss, /\.issuer-api-keys-card__create-action \{[\s\S]*?margin-left: auto/);
});


test('Create API key is disabled at the backend active-key limit and cannot open the create modal', () => {
  assert.match(apiKeys, /capacity\.remainingSlots === 0/);
  assert.match(apiKeys, /capacity\.activeKeyCount >= capacity\.maxActiveKeys/);
  assert.match(apiKeys, /const openCreateApiKey = \(\) => \{[\s\S]*?if \(activeKeyLimitReached \|\| !policyOptionsQuery\?\.isSuccess/);
  assert.match(apiKeys, /disabled=\{activeKeyLimitReached \|\| !policyOptionsQuery\?\.isSuccess/);
  assert.match(apiKeys, /Disable an existing key to create another/);
  assert.match(organizationCss, /\.issuer-api-keys-card__limit-message/);
});
