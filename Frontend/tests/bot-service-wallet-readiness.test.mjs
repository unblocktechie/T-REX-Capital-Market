import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getBotWalletReadiness, deployedTokenAddress } from '../src/utils/botServiceWalletReadiness.js';
import { tokenServiceWalletAddress } from '../src/services/issuer/tokenServiceWallet.utils.js';

const wallet = '0x1234567890123456789012345678901234567890';
const other = '0x9876543210987654321098765432109876543210';
const context = { tokenUid: 'token-A', chainUid: 'chain-1' };
const verified = { ...context, registeredAddress: wallet, onchainAddress: wallet, canVerify: true };

test('readiness is verified only after matching a real token- and chain-scoped on-chain wallet', () => {
  assert.deepEqual(getBotWalletReadiness(verified), { code: 'verified', ready: true, label: 'Verified' });
  assert.equal(getBotWalletReadiness({ ...verified, onchainAddress: other }).ready, false);
  assert.equal(getBotWalletReadiness({ ...verified, verificationFailed: true }).ready, false);
  assert.equal(getBotWalletReadiness({ ...verified, canVerify: false }).ready, false);
  assert.equal(getBotWalletReadiness({ ...verified, verificationPending: true }).ready, false);
  assert.equal(getBotWalletReadiness({ ...verified, contextMatches: false }).code, 'wrong-network');
});

test('missing, invalid, zero, and legacy unscoped registrations cannot make a bot ready', () => {
  assert.equal(getBotWalletReadiness({ ...context }).code, 'missing');
  assert.equal(getBotWalletReadiness({ ...verified, registeredAddress: '0x' }).ready, false);
  assert.equal(getBotWalletReadiness({ ...verified, registeredAddress: `0x${'0'.repeat(40)}` }).ready, false);
  assert.equal(getBotWalletReadiness({ tokenUid: '', chainUid: '' }).code, 'no-token');
  assert.equal(tokenServiceWalletAddress([{ tokenUid: 'token-B', chainUid: 'chain-1', serviceWalletAddress: wallet }], 'token-A', 'chain-1'), '');
  assert.equal(tokenServiceWalletAddress([{ tokenUid: 'token-A', chainUid: 'chain-2', serviceWalletAddress: wallet }], 'token-A', 'chain-1'), '');
});

test('deployed contract resolver reads only valid token contract addresses', () => {
  assert.equal(deployedTokenAddress({ deployment: { tokenAddress: wallet } }), wallet);
  assert.equal(deployedTokenAddress({ tokenAddress: 'bogus', contracts: { token: other } }), other);
  assert.equal(deployedTokenAddress({ walletAddress: wallet }), '');
});

test('issuer bot setup combines API/IP readiness with token-specific on-chain wallet verification', async () => {
  const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /const ready = apiReady && walletStatus\.ready/);
  assert.match(page, /tokenServiceWalletAddress\(organization\?\.tokenServiceWallets, tokenUid, tokenChainUid\)/);
  assert.match(page, /readTokenServiceWallet\(/);
  assert.match(page, /Service Wallet · \{walletStatus\.label\}/);
  assert.match(page, /onClick=\{openWalletSetup\}/);
  assert.match(page, /pendingWalletTarget/);
  assert.match(page, /Discard unsaved changes\?/);
});

test('token Details to Bot Configuration carries the selected token and returns to its wallet editor', async () => {
  const details = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
  const modal = await readFile(new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url), 'utf8');
  assert.match(details, /new URLSearchParams\(\{ tab: 'api-keys', tokenUid, chainUid: tokenChainUid \}\)/);
  assert.match(details, /botConfigurationLink=\{botConfigurationLink\}/);
  assert.match(details, /tokenSearchParams\.get\('setup'\) !== 'service-wallet'/);
  assert.match(modal, /to=\{botConfigurationLink\}/);
});


test('completed bot setup has generic, clear copy without displaying the token identity', async () => {
  const page = await readFile(new URL('../src/pages/issuer/IssuerApiKeysPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /A Service Wallet is verified on-chain for your asset, and an active API key has approved IPs\./);
  assert.doesNotMatch(page, /bot-config__token-context/);
  assert.doesNotMatch(page, /getTokenRecordName/);
  // Token-and-chain-specific verification must still drive readiness.
  assert.match(page, /const ready = apiReady && walletStatus\.ready/);
  assert.match(page, /requestedTokenUid/);
  assert.match(page, /requestedChainUid/);
});
