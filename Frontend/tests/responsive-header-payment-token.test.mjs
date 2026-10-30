import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [tokenPage, tokenCss, globalCss, mainLayout, header] = await Promise.all([
  read('../src/pages/tokens/TokenDetailsPage.jsx'),
  read('../src/assets/styles/token-issuance.css'),
  read('../src/assets/styles/global.css'),
  read('../src/layouts/MainLayout.jsx'),
  read('../src/layouts/components/Header.jsx'),
]);

test('issuer current price uses a readable payment-token icon without altering token metadata', () => {
  const price = tokenPage.slice(tokenPage.indexOf('className="token-dashboard-header__price-value"'));
  assert.match(price, /<TokenIcon\s+symbol=\{paymentSymbol\}[\s\S]*?imageUrl=\{paymentTokenMetadata\.imageUrl\}[\s\S]*?size="sm"/);
  assert.match(price, /<TokenPriceValue value=\{currentPrice\} suffix=/);
  assert.match(tokenCss, /\.token-dashboard-header__price-value > \.token-icon\s*\{[^}]*width: 24px;[^}]*height: 24px;/);
});

test('intermediate desktop header hides title only with expanded sidebar', () => {
  assert.match(mainLayout, /collapsed && !onboardingOnly && 'app-shell--sidebar-collapsed'/);
  assert.match(header, /className="header-page-title"/);
  assert.match(header, /toggleSidebarCollapsed\(\)/);
  const responsive = globalCss.slice(globalCss.lastIndexOf('Intermediate desktop header'));
  assert.match(responsive, /@media \(min-width: 901px\) and \(max-width: 1180px\)/);
  assert.match(responsive, /:not\(\.app-shell--sidebar-collapsed\) \.header-page-title\s*\{\s*display: none;/);
  assert.doesNotMatch(responsive, /\.app-shell--sidebar-collapsed\s+\.header-page-title/);
  assert.match(responsive, /\.app-header__leading\s*\{[^}]*flex: 0 0 auto;/s);
});

test('mobile header and existing network/wallet/account actions remain intact', () => {
  assert.match(globalCss, /@media \(max-width: 680px\)/);
  assert.match(header, /<AppNetworkSwitcher/);
  assert.match(header, /<WalletControl/);
  assert.match(header, /\{accountMenu\}/);
  assert.match(header, /aria-label="Toggle navigation"/);
});
