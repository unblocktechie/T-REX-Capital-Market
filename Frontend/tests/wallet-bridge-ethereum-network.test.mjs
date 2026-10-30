import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [bridgeSource, web3Source, walletAssetsSource, walletHookSource, walletControlSource, walletPageSource, mainnetEnv, testnetEnv] = await Promise.all([
  readFile(new URL('../src/config/bridgeNetworks.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/config/web3.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/wallet/walletAssets.service.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/hooks/useWalletConnection.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/wallet/WalletControl.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/wallet/WalletManagementPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../.env.mainnet', import.meta.url), 'utf8'),
  readFile(new URL('../.env.testnet', import.meta.url), 'utf8'),
]);

test('ethereum bridge-only profile exists for mainnet and sepolia without becoming a platform chain', () => {
  assert.match(bridgeSource, /chainId:\s*1,/);
  assert.match(bridgeSource, /chainId:\s*11155111,/);
  assert.match(bridgeSource, /bridgeOnly:\s*true/);
  assert.match(bridgeSource, /supportedActions:\s*Object\.freeze\(\['BRIDGE'\]\)/);
  assert.match(web3Source, /supportedChains = chainRecords\.map\(toWagmiChain\)/);
  assert.match(web3Source, /walletChains = \[\.\.\.supportedChains, \.\.\.bridgeChains\]/);
  assert.match(web3Source, /chains:\s*walletChains/);
});

test('wallet balance reads and wallet switching accept bridge-only ethereum', () => {
  assert.match(walletAssetsSource, /getWalletChainById/);
  assert.match(walletAssetsSource, /getWalletChainRecordById/);
  assert.match(walletHookSource, /web3Config\.walletChains\.find/);
  assert.match(walletHookSource, /isConfiguredWalletChain/);
  assert.match(walletControlSource, /allowConfiguredWalletChains/);
  assert.match(walletControlSource, /wallet\.isConfiguredWalletChain/);
});

test('wallet management shows bridge-only networks but backend config is fetched only for platform records', () => {
  assert.match(walletPageSource, /web3Config\.walletChains\.map/);
  assert.match(walletPageSource, /getWalletChainRecordById/);
  assert.match(walletPageSource, /useChainConfig\(selectedPlatformRecord\?\.chainUid\)/);
  assert.match(walletPageSource, /return \[\.\.\.platformConfigs, \.\.\.bridgeOnlyRecords\]/);
  assert.match(walletPageSource, /Bridge only/);
});

test('deployment profiles pin canonical ethereum USDC addresses for bridge balances', () => {
  assert.match(mainnetEnv, /VITE_BRIDGE_ETHEREUM_USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/);
  assert.match(testnetEnv, /VITE_BRIDGE_ETHEREUM_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238/);
  assert.match(mainnetEnv, /VITE_BRIDGE_ETHEREUM_RPC_URL=https:\/\/ethereum-rpc\.publicnode\.com/);
  assert.match(testnetEnv, /VITE_BRIDGE_ETHEREUM_RPC_URL=https:\/\/ethereum-sepolia-rpc\.publicnode\.com/);
});
