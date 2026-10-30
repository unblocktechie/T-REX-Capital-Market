import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [css, switcher, wallet, header] = await Promise.all([
  read('../src/assets/styles/global.css'),
  read('../src/components/common/AppNetworkSwitcher.jsx'),
  read('../src/components/wallet/WalletControl.jsx'),
  read('../src/layouts/components/Header.jsx'),
]);
const mobile = css.slice(css.lastIndexOf('Mobile header: icon-only network trigger'));

test('mobile network trigger shows only a properly sized icon at 680px and below', () => {
  assert.match(mobile, /@media \(max-width: 680px\)/);
  assert.match(mobile, /\.app-network-switcher\s*\{[^}]*width: 46px;[^}]*min-width: 46px;[^}]*max-width: 46px;[^}]*flex: 0 0 46px;/s);
  assert.match(mobile, /\.app-network-switcher > button\s*\{[^}]*min-height: 44px;[^}]*justify-content: center;/s);
  assert.match(mobile, /\.app-network-switcher > button > \.app-network-switcher__icon\s*\{[^}]*width: 32px;[^}]*height: 32px;/s);
  assert.match(mobile, /\.app-network-switcher__icon > img\s*\{[^}]*object-fit: contain;/s);
  assert.match(mobile, /\.app-network-switcher__label,[\s\S]*?\.app-network-switcher__status-icon\s*\{[^}]*display: none;/s);
  assert.match(switcher, /<Lock className="app-network-switcher__status-icon app-network-switcher__status-icon--lock/);
});

test('wallet button is wider and still truncates long addresses on narrow phones', () => {
  assert.match(mobile, /@media \(max-width: 520px\)/);
  assert.match(mobile, /@media \(max-width: 680px\)[\s\S]*?\.header-wallet-control\s*\{[^}]*max-width: 154px;[^}]*flex: 1 1 154px;/s);
  assert.match(mobile, /@media \(max-width: 520px\)[\s\S]*?\.header-wallet-control\s*\{[^}]*max-width: 154px;[^}]*flex: 1 1 154px;/s);
  assert.match(mobile, /\.header-wallet-control > button > span:nth-child\(2\) strong\s*\{[^}]*text-overflow: ellipsis;/s);
  assert.match(mobile, /@media \(max-width: 340px\)[\s\S]*?\.header-wallet-control\s*\{[^}]*max-width: 132px;[^}]*flex: 1 1 132px;/s);
  assert.match(mobile, /@media \(max-width: 340px\)[\s\S]*?\.header-wallet-control > button > span:nth-child\(2\)\s*\{[^}]*display: block;/s);
});

test('network dropdown and wallet actions are unchanged and retain accessible names', () => {
  assert.match(header, /<AppNetworkSwitcher/);
  assert.match(header, /<WalletControl/);
  assert.match(header, /\{accountMenu\}/);
  assert.match(switcher, /aria-label=\{`Application network:/);
  assert.match(switcher, /aria-haspopup="menu"/);
  assert.match(switcher, /onClick=\{\(\) => setOpen/);
  assert.match(wallet, /aria-label=\{wallet\.isConnected \? 'Open wallet menu' : 'Connect wallet'\}/);
});

test('all project documentation stays under docs and no preview file ships', async () => {
  const { readdir, access } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const project = new URL('../', import.meta.url);
  const root = await readdir(project);
  assert.deepEqual(root.filter((name) => name.toLowerCase().endsWith('.md')), []);
  assert.equal(root.includes('layout-preview.html'), false);
  await access(new URL('../docs/README.md', import.meta.url));
  await access(new URL('../docs/MOBILE_NETWORK_WALLET_HEADER_FIX_NOTES.md', import.meta.url));
  await access(new URL('../docs/MOBILE_NETWORK_ICON_ONLY_UPDATE.md', import.meta.url));
});
