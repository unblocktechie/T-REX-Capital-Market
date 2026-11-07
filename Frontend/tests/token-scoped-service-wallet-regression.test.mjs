import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  tokenServiceWalletAddress,
  normalizeTokenServiceWallets,
  updateTokenServiceWallet,
} from '../src/services/issuer/tokenServiceWallet.utils.js';

const walletA = '0x0000000000000000000000000000000000000001';
const walletB = '0x0000000000000000000000000000000000000002';
const zero = '0x0000000000000000000000000000000000000000';
const fixtures = [
  { tokenUid: 'alpha', chainUid: 'sepolia', serviceWalletAddress: walletA },
  { tokenUid: 'beta', chainUid: 'sepolia', serviceWalletAddress: walletB },
  { tokenUid: 'alpha', chainUid: 'arc', serviceWalletAddress: walletB },
];

test('each token and chain resolves only its own registered Service Wallet', () => {
  assert.equal(tokenServiceWalletAddress(fixtures, 'alpha', 'sepolia'), walletA);
  assert.equal(tokenServiceWalletAddress(fixtures, 'beta', 'sepolia'), walletB);
  assert.equal(tokenServiceWalletAddress(fixtures, 'alpha', 'arc'), walletB);
  assert.equal(tokenServiceWalletAddress(fixtures, 'missing', 'sepolia'), '');
  assert.equal(tokenServiceWalletAddress(fixtures, 'alpha', 'unknown'), '');
});

test('revoking alpha on Sepolia never affects beta or alpha on ARC', () => {
  const changed = updateTokenServiceWallet(fixtures, 'alpha', 'sepolia', zero);
  assert.equal(tokenServiceWalletAddress(changed, 'alpha', 'sepolia'), '');
  assert.equal(tokenServiceWalletAddress(changed, 'beta', 'sepolia'), walletB);
  assert.equal(tokenServiceWalletAddress(changed, 'alpha', 'arc'), walletB);
});

test('tokens without a UID and chain cannot gain a verified registration', () => {
  assert.equal(tokenServiceWalletAddress(fixtures, '', 'sepolia'), '');
  assert.throws(() => updateTokenServiceWallet(fixtures, '', 'sepolia', walletA));
  assert.deepEqual(normalizeTokenServiceWallets([{ serviceWalletAddress: walletA }]), []);
});

test('organization legacy alias is not used for token permissions', async () => {
  const mapper = await readFile(new URL('../src/api/organization/organization.mapper.js', import.meta.url), 'utf8');
  const tokenDetails = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
  const organizationApi = await readFile(new URL('../src/api/organization/organization.api.js', import.meta.url), 'utf8');
  assert.match(mapper, /tokenServiceWallets: normalizeTokenServiceWallets\(data\.tokenServiceWallets\)/);
  assert.match(tokenDetails, /tokenServiceWalletAddress\(\s*organization\?\.tokenServiceWallets, tokenUid, tokenChainUid/);
  assert.doesNotMatch(tokenDetails, /organization\.serviceWalletAddress/);
  assert.match(organizationApi, /\{ serviceWalletAddress, tokenUid \}/);
});
