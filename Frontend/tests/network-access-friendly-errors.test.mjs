import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  NETWORK_SETUP_FAILED_MESSAGE,
  NETWORK_UNLOCK_FAILED_MESSAGE,
} from '../src/utils/networkAccessMessages.js';

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

const unsafeProviderMessages = [
  'execution reverted: AccessControl: account 0xdbcda99568b54feaab6c6d34e8f0093c590859 is missing role 0x32d95f4978',
  'ContractFunctionRevertedError: Contract Call: function: createIdentity args: [0xabc123] Docs: https://viem.sh/',
  'RPC Error: eth_estimateGas failed with raw request arguments and gas estimate',
];

test('customer-facing network setup copy is concise, actionable, and never echoes provider details', () => {
  assert.match(NETWORK_SETUP_FAILED_MESSAGE, /something went wrong/i);
  assert.match(NETWORK_SETUP_FAILED_MESSAGE, /try again/i);
  assert.match(NETWORK_UNLOCK_FAILED_MESSAGE, /try again/i);
  for (const message of [NETWORK_SETUP_FAILED_MESSAGE, NETWORK_UNLOCK_FAILED_MESSAGE]) {
    assert.ok(message.length <= 130, 'message should fit in a small card/toast');
    for (const unsafe of ['execution reverted', 'AccessControl', 'eth_estimateGas', '0x', 'RPC Error']) {
      assert.ok(!message.includes(unsafe), `${unsafe} must not appear in UI copy`);
    }
    for (const diagnostic of unsafeProviderMessages) {
      assert.notEqual(message, diagnostic);
      assert.ok(!message.includes(diagnostic));
    }
  }
});

test('network access card never interpolates raw API identityErrorMessage', async () => {
  const page = await source('pages/common/ChainAccessPage.jsx');
  assert.match(page, /chain\.identityStatus === 'FAILED' \? <span>\{NETWORK_SETUP_FAILED_MESSAGE\}<\/span>/);
  assert.doesNotMatch(page, /\{chain\.identityErrorMessage\}/);
  assert.match(page, /<article key=\{chain\.chainUid\} className="flex min-h-72 min-w-0/);
  assert.match(page, /min-h-14 min-w-0 rounded-2xl/);
  assert.match(page, /chain\.identityStatus === 'FAILED' \? 'Retry unlock'/);
  assert.match(page, /\{chain\.isUnlocked \? <div/);
  assert.match(page, /ROLES\.issuer/);
  assert.match(page, /description: NETWORK_UNLOCK_FAILED_MESSAGE/);
});

test('navbar and asset network unlock errors use safe shared message', async () => {
  for (const path of ['components/common/AppNetworkSwitcher.jsx', 'pages/tokens/TokenInformationPage.jsx']) {
    const page = await source(path);
    assert.match(page, /import \{ NETWORK_UNLOCK_FAILED_MESSAGE \} from '@\/utils\/networkAccessMessages';/);
    assert.match(page, /description: NETWORK_UNLOCK_FAILED_MESSAGE/);
  }
  const navbar = await source('components/common/AppNetworkSwitcher.jsx');
  assert.match(navbar, /'CHAIN_IDENTITY_CREATION_IN_PROGRESS'/);
  assert.match(navbar, /isSubmittedInvestorNetwork\(chain, network\.investorOnboardingChainUid\)/);
});

test('raw diagnostic data remains available in API record for support, not displayed to account users', async () => {
  const api = await source('api/chains/chains.api.js');
  const page = await source('pages/common/ChainAccessPage.jsx');
  assert.match(api, /identityErrorMessage: String\(row\.identityErrorMessage/);
  assert.doesNotMatch(page, /identityErrorMessage/);
});
