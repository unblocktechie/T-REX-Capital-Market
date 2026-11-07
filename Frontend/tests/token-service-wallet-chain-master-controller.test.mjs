import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveTokenServiceWalletController } from '../src/services/issuer/tokenServiceWalletController.utils.js';

const oldController = '0x1111111111111111111111111111111111111111';
const chainMasterController = '0x2222222222222222222222222222222222222222';

const tokenChainUid = 'robinhood-uid';
const tokenChainId = 46630;

const target = { tokenChainUid, tokenChainId };

test('resolves the existing Chain Master proxy even if token metadata has no controller', () => {
  assert.equal(resolveTokenServiceWalletController({
    ...target,
    chainConfig: { chainUid: tokenChainUid, chainId: tokenChainId, contracts: { platform: { platformController: chainMasterController } } },
  }), chainMasterController);
});

test('the detailed Chain Master config takes precedence over the public chain list', () => {
  assert.equal(resolveTokenServiceWalletController({
    ...target,
    chainConfig: { ...target, platformControllerAddress: chainMasterController },
    chainRecord: { chainUid: tokenChainUid, chainId: tokenChainId, platformControllerAddress: oldController },
  }), chainMasterController);
});

test('uses the chain master catalogue when detailed config is unavailable', () => {
  assert.equal(resolveTokenServiceWalletController({
    ...target, chainRecord: { chainUid: tokenChainUid, chainId: tokenChainId, platformControllerAddress: oldController },
  }), oldController);
});

test('never crosses chains or mistakes a token address for the controller', () => {
  assert.equal(resolveTokenServiceWalletController({
    ...target, chainConfig: { chainUid: 'different', chainId: 11155111, platformControllerAddress: oldController },
  }), '');
  assert.equal(resolveTokenServiceWalletController({
    ...target, chainRecord: { chainUid: tokenChainUid, chainId: tokenChainId, platformControllerAddress: 'bad-address' },
  }), '');
});

test('registration, revocation and reads use the resolved Chain Master controller only', async () => {
  const source = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /const serviceWalletControllerAddress = resolveTokenServiceWalletController/);
  assert.match(source, /readTokenServiceWallet\(\{[\s\S]*?platformControllerAddress: serviceWalletControllerAddress/);
  assert.match(source, /registerIssuerServiceWallet\(\{[\s\S]*?platformControllerAddress: chainController/);
  assert.match(source, /revokeIssuerServiceWallet\(\{[\s\S]*?platformControllerAddress: chainController/);
  assert.doesNotMatch(source, /!candidateTokenContractAddress \|\| !controllerAddress/);
  assert.match(source, /getPlatformTokenPrice\(\{[^\n]*controllerAddress/);
});
