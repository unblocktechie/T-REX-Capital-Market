import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  getNetworkEnvironmentLabel,
  resolveNetworkEnvironment,
} from '../src/utils/networkEnvironment.js';

const sidebarSource = await readFile(
  new URL('../src/layouts/components/Sidebar.jsx', import.meta.url),
  'utf8',
);

test('selected chain environment is authoritative over the deployment-profile fallback', () => {
  assert.equal(resolveNetworkEnvironment({ isTestnet: false }, 'testnet'), 'mainnet');
  assert.equal(resolveNetworkEnvironment({ isTestnet: true }, 'mainnet'), 'testnet');
  assert.equal(getNetworkEnvironmentLabel({ isTestnet: false }, 'testnet'), 'Mainnet');
  assert.equal(getNetworkEnvironmentLabel({ isTestnet: true }, 'mainnet'), 'Testnet');
});

test('deployment profile is used only when selected chain metadata is unavailable', () => {
  assert.equal(getNetworkEnvironmentLabel(null, 'mainnet'), 'Mainnet');
  assert.equal(getNetworkEnvironmentLabel(undefined, 'testnet'), 'Testnet');
});

test('sidebar no longer hardcodes the testnet badge', () => {
  assert.doesNotMatch(sidebarSource, /workspace-pill__network\">Testnet</);
  assert.match(sidebarSource, /workspace-pill__network\">\{networkEnvironmentLabel\}/);
});
