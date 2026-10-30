import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('issuer sidebar displays Token Management without changing token navigation route', async () => {
  const source = await read('../src/config/navigation.js');
  assert.match(source, /label: 'Token Management',\s*shortLabel: 'Token Management',\s*to: ROUTES\.createToken,\s*icon: Coins,\s*permission: PERMISSIONS\.dashboardView,\s*dynamicToken: true/s);
});

test('token header uses backend chain artwork and a compact icon-plus-name chip', async () => {
  const page = await read('../src/pages/tokens/TokenDetailsPage.jsx');
  const css = await read('../src/assets/styles/token-issuance.css');
  assert.match(page, /const tokenChainRecord = web3Config\.getChainRecordById\(tokenChainId\)/);
  assert.match(page, /<span className="token-dashboard-header__network-chip">\s*<NetworkIcon chain=\{tokenChainRecord\} chainId=\{tokenChainId\} name=\{network\} size="xs" \/>\s*<span>\{network\}<\/span>/s);
  assert.doesNotMatch(page, /Network: \{network\}<\/span>/);
  assert.match(css, /\.token-dashboard-header__status > \.token-dashboard-header__network-chip\s*\{/);
  assert.match(css, /\.token-dashboard-header__network-chip > span:last-child\s*\{/);
});

test('asset price icon retrieves saved payment contract image from backend chain catalogue', async () => {
  const page = await read('../src/pages/tokens/TokenDetailsPage.jsx');
  const hook = await read('../src/hooks/usePaymentTokenMetadata.js');
  assert.match(page, /usePaymentTokenMetadata\(\{\s*paymentTokenAddress,\s*paymentTokenSymbol: paymentSymbol,\s*chainUid: information\.chainUid \|\| raw\.chainUid \|\| token\.selectedChainUid,\s*chainId: tokenChainId/s);
  assert.match(page, /<TokenIcon\s*symbol=\{paymentSymbol\}\s*name=\{paymentTokenMetadata\.name \|\| paymentSymbol\}\s*imageUrl=\{paymentTokenMetadata\.imageUrl\}/s);
  assert.match(hook, /normalizeAddress\(item\?\.contractAddress\) === normalizedAddress/);
  assert.match(hook, /imageUrl: paymentToken \? resolveMasterImageUrl\(paymentToken\) : ''/);
  assert.match(page, /<TokenPriceValue value=\{currentPrice\} suffix=\{` \$\{paymentSymbol\}`\} \/>/);
});
