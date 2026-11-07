import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url),
  'utf8',
);
const card = await readFile(
  new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url),
  'utf8',
);
const css = await readFile(
  new URL('../src/assets/styles/token-issuance.css', import.meta.url),
  'utf8',
);

test('asset details exposes automated price updates as a dedicated row above technical information', () => {
  const priceLabel = page.indexOf('Current investor price');
  const investorAccess = page.indexOf('token-dashboard-header__readiness');
  const automation = page.indexOf('token-dashboard-header__automation');
  const technicalInformation = page.indexOf('Technical asset information');

  assert.ok(priceLabel >= 0);
  assert.ok(investorAccess > priceLabel);
  assert.ok(automation > investorAccess);
  assert.ok(technicalInformation > automation);
  assert.match(page, /Automatic Price Updates/);
  assert.match(page, /onClick=\{\(\) => setPriceAutomationOpen\(true\)\}/);
  assert.match(page, /aria-haspopup="dialog"/);
});

test('automation control opens an accessible modal using the shared price updates card', () => {
  assert.match(page, /open=\{priceAutomationOpen\}/);
  assert.match(page, /title="Price update settings"/);
  assert.match(page, /trapFocus/);
  assert.match(page, /<PriceUpdatesCard/);
  assert.match(page, /walletFieldId="asset-service-wallet-address"/);
});

test('asset details keeps Service Wallet management visible and supports register, rotate, and revoke independently from API keys', () => {
  assert.match(page, /serviceWalletAlwaysEnabled/);
  assert.match(page, /serviceWalletAddress=\{serviceWalletAddress\}/);
  assert.match(page, /onServiceWalletSubmit=\{handleServiceWalletRegistration\}/);
  assert.match(page, /registerIssuerServiceWallet/);
  assert.match(page, /organizationApi\.syncServiceWallet/);
  assert.match(page, /onServiceWalletRevoke=\{handleServiceWalletRevoke\}/);
  assert.match(page, /revokeIssuerServiceWallet/);
  assert.match(page, /SERVICE_WALLET_ZERO_ADDRESS/);
  assert.match(page, /Manual updates and API keys are unchanged/);
  assert.doesNotMatch(page, /serviceWalletEnabled=\{serviceWalletEnabled\}/);
  assert.doesNotMatch(page, /onServiceWalletEnabledChange=\{setServiceWalletEnabled\}/);
  assert.match(card, /serviceWalletAlwaysEnabled = false/);
  assert.match(card, /!serviceWalletAlwaysEnabled \? \([\s\S]*?<Toggle/);
  assert.match(card, /This wallet is registered to approve automatic price updates for this token/);
  assert.match(card, /Remove Wallet Access/);
  assert.match(card, /Set up API keys and approved IP addresses to run your bots/);
});

test('automated price update entry point and modal are responsive with one reliable scroll owner', () => {
  assert.match(css, /\.token-dashboard-header__automation \{[\s\S]*?grid-column: 1 \/ -1;/);
  assert.match(css, /\.token-price-automation-modal__intro \{/);
  assert.match(css, /\.token-price-automation-modal \{[\s\S]*?max-width: 1040px !important;[\s\S]*?height: min\(800px, calc\(100dvh - 40px\)\);[\s\S]*?overflow-y: auto !important;[\s\S]*?scrollbar-gutter: stable;[\s\S]*?-webkit-overflow-scrolling: touch;/);
  assert.match(css, /\.token-price-automation-modal > header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(css, /\.token-price-automation-modal__body \{[\s\S]*?flex: 0 0 auto !important;[\s\S]*?min-height: auto !important;[\s\S]*?overflow: visible !important;/);
  assert.match(css, /\.token-price-automation-modal > footer \{[\s\S]*?position: sticky;[\s\S]*?bottom: 0;/);
  assert.match(css, /@media \(min-width: 521px\) and \(max-width: 900px\)[\s\S]*?\.token-price-automation-modal \{[\s\S]*?height: calc\(100dvh - 40px\);/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.token-price-automation-modal \{[\s\S]*?height: calc\(100dvh - 8px\);[\s\S]*?overflow-y: auto !important;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.token-price-automation-modal__body \{[\s\S]*?overflow: visible !important;/);
  assert.match(css, /scroll-margin-bottom: 104px;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.token-dashboard-header__automation-button \{[\s\S]*?width: 100%;/);
  assert.match(css, /@media \(max-width: 360px\)/);
});


test('configure action uses the application sidebar visual treatment', () => {
  assert.match(css, /\.token-dashboard-header__automation-button \{[\s\S]*?background: linear-gradient\(180deg, #162235 0%, #0d1729 100%\);/);
  assert.match(css, /\.token-dashboard-header__automation-button \{[\s\S]*?color: #f8fbff;/);
  assert.match(css, /\.token-dashboard-header__automation-button:hover \{/);
  assert.match(css, /\.token-dashboard-header__automation-button:focus-visible \{/);
});

test('automation dialog footer stays fully opaque while the mobile sheet scrolls', () => {
  assert.match(css, /\.token-price-automation-modal > footer \{[\s\S]*?background: #f8fafc;[\s\S]*?opacity: 1;[\s\S]*?backdrop-filter: none;/);
});


test('technical details disclosure spans and aligns with the full asset header width', () => {
  assert.match(page, /id="asset-technical-details" className="token-dashboard-header__technical-row"/);
  assert.match(css, /\.token-dashboard-header__technical-row \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(css, /\.token-dashboard-header__technical \{[\s\S]*?width: 100%;[\s\S]*?box-sizing: border-box;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.token-dashboard-header__technical-row,[\s\S]*?max-width: 100%;/);
});

test('automation dialog uses a slim theme-aware scrollbar without changing the scroll owner', () => {
  assert.match(css, /\.token-price-automation-modal \{[\s\S]*?scrollbar-width: thin;[\s\S]*?scrollbar-color:/);
  assert.match(css, /\.token-price-automation-modal::\-webkit-scrollbar \{[\s\S]*?width: 8px;/);
  assert.match(css, /\.token-price-automation-modal::\-webkit-scrollbar-track \{[\s\S]*?background: transparent;/);
  assert.match(css, /\.token-price-automation-modal::\-webkit-scrollbar-thumb \{[\s\S]*?border-radius: 999px;[\s\S]*?background-clip: padding-box;/);
  assert.match(css, /\.token-price-automation-modal::\-webkit-scrollbar-button,[\s\S]*?width: 0;[\s\S]*?height: 0;/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?::-webkit-scrollbar-thumb:hover/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?::-webkit-scrollbar \{[\s\S]*?width: 6px;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?::-webkit-scrollbar \{[\s\S]*?width: 5px;/);
});


test('price update settings Done action matches the dark primary buttons without changing its close handler or mobile sizing', async () => {
  const globalCss = await readFile(
    new URL('../src/assets/styles/global.css', import.meta.url),
    'utf8',
  );
  assert.match(page, /footer=\{\(\s*<Button variant="primary" onClick=\{\(\) => setPriceAutomationOpen\(false\)\}>\s*Done\s*<\/Button>/);
  assert.match(card, /button--primary button--sm price-updates-bot-setup__cta/);
  assert.match(globalCss, /\.button--primary \{[\s\S]*?background: linear-gradient\(135deg, var\(--primary-500\), var\(--primary-600\)\);/);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*?\.token-price-automation-modal > footer \.button \{\s*width: 100%;/);
});
