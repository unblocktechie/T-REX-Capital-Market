import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const src = (path) => readFileSync(new URL(path, root), 'utf8');
const source = src('src/utils/tokenContractLink.js').replace(
  "import { getChainRecordById, getChainRecordByUid } from '@/config/web3';",
  `const chains = [
    { chainUid: 'arc', chainId: 5042002, explorerUrl: 'https://testnet.arcscan.app/' },
    { chainUid: 'arb', chainId: 42161, explorerUrl: 'https://arbiscan.io/' },
    { chainUid: 'private', chainId: 777, explorerUrl: '' },
  ];
  const getChainRecordById = (id) => chains.find(c => c.chainId === Number(id)) || null;
  const getChainRecordByUid = (uid) => chains.find(c => c.chainUid === uid) || null;`,
);
const helpers = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const address = '0x742d35Cc6634C0532925a3b844Bc454e4438fE42';

// An example contract address is used only for tests; the frontend reads the real API value.
test('shows a short contract address and retains the full one for copying', () => {
  assert.equal(helpers.shortenTokenContractAddress(address), '0x742d...fE42');
  assert.equal(helpers.shortenTokenContractAddress('0xshort'), '—');
  assert.equal(helpers.isTokenContractAddress(address), true);
});

test('links only to the offering chain explorer, without switching to the default chain', () => {
  assert.equal(helpers.tokenContractExplorerUrl({ address, chainUid: 'arc', chainId: 5042002 }), `https://testnet.arcscan.app/address/${address}`);
  assert.equal(helpers.tokenContractExplorerUrl({ address, chainUid: 'arb' }), `https://arbiscan.io/address/${address}`);
  assert.equal(helpers.tokenContractExplorerUrl({ address, chainId: 42161 }), `https://arbiscan.io/address/${address}`);
  assert.equal(helpers.tokenContractExplorerUrl({ address, chainUid: 'arc', chainId: 42161 }), '');
  assert.equal(helpers.tokenContractExplorerUrl({ address, chainUid: 'not-found' }), '');
  assert.equal(helpers.tokenContractExplorerUrl({ address }), '');
  assert.equal(helpers.tokenContractExplorerUrl({ address: '0x123', chainUid: 'arc' }), '');
  assert.equal(helpers.tokenContractExplorerUrl({ address, chainUid: 'private' }), '');
});

test('uses valid explorer protocols only', async () => {
  const other = source.replace("{ chainUid: 'arc', chainId: 5042002, explorerUrl: 'https://testnet.arcscan.app/' }", "{ chainUid: 'arc', chainId: 5042002, explorerUrl: 'javascript:alert(1)' }");
  const insecure = await import(`data:text/javascript,${encodeURIComponent(other)}`);
  assert.equal(insecure.tokenContractExplorerUrl({ address, chainUid: 'arc' }), '');
});

test('marketplace UI includes copy and explorer controls and no static example address', () => {
  const jsx = src('src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  assert.match(jsx, /<span>Token contract address<\/span>/);
  assert.match(jsx, /onClick=\{\(\) => copyValue\(contractAddress, 'Token contract address'\)\}/);
  assert.match(jsx, /href=\{contractExplorerUrl\}/);
  assert.match(jsx, /target="_blank"/);
  assert.match(jsx, /rel="noopener noreferrer"/);
  assert.match(jsx, /chainUid: token\.chainUid/);
  assert.match(jsx, /chainId: token\.chainId/);
  assert.doesNotMatch(jsx, /0x742d/);
});

test('keeps the two-column technical grid, responsive mobile layout and existing controls', () => {
  const css = src('src/assets/styles/investor.css');
  const jsx = src('src/pages/investor-portal/MarketplaceTokenDetailsPage.jsx');
  assert.match(css, /\.marketplace-contract-address\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /\.marketplace-contract-address__line\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 860px\)/);
  for (const name of ['Token standard', 'Decimal precision', 'onInvest', 'onRedeem', 'onSend']) assert.ok(jsx.includes(name));
});

test('the mapper keeps resolving token contracts from known API fields', async () => {
  const mapper = src('src/api/investments/investment.mapper.js').replace("import { paymentContextOf } from '@/config/payment-tokens';", 'const paymentContextOf = () => ({});');
  const { mapMarketplaceToken } = await import(`data:text/javascript,${encodeURIComponent(mapper)}`);
  for (const raw of [
    { tokenAddress: address },
    { contractAddress: address },
    { tokenContractAddress: address },
    { deployment: { tokenAddress: address } },
  ]) assert.equal(mapMarketplaceToken(raw).tokenAddress, address);
});
