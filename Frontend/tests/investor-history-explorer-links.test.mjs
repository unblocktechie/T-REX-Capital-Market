import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveChainExplorerUrl } from '../src/utils/chainExplorerOverrides.js';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const purchasePage = source('pages/investor-portal/PurchaseTokenPage.jsx');
const redemptionPage = source('pages/investor-portal/RedeemTokenPage.jsx');
const explorer = source('utils/blockExplorer.js');
const hash = `0x${'a'.repeat(64)}`;

test('Robinhood testnet history always points to its explorer, even if backend is missing an explorer URL', () => {
  assert.equal(resolveChainExplorerUrl(46630), 'https://explorer.testnet.chain.robinhood.com');
  assert.equal(`${resolveChainExplorerUrl(46630, '')}/tx/${hash}`, `https://explorer.testnet.chain.robinhood.com/tx/${hash}`);
  assert.notEqual(resolveChainExplorerUrl(4663, ''), resolveChainExplorerUrl(46630, ''));
});

test('Other network explorer URLs stay as configured by backend', () => {
  assert.equal(resolveChainExplorerUrl(421614, 'https://sepolia.arbiscan.io'), 'https://sepolia.arbiscan.io');
  assert.equal(resolveChainExplorerUrl(5042002, 'https://testnet.arcscan.app'), 'https://testnet.arcscan.app');
});

test('Investment history reads the transactionHash returned by the /investments/transactions API', () => {
  assert.match(purchasePage, /purchase\?\.transactionHash/);
  assert.match(purchasePage, /const txHash = paymentHashOf\(row\)/);
  assert.match(purchasePage, /const rowPaymentHash = paymentHashOf\(row\)/);
  assert.match(purchasePage, /transactionExplorerUrl\(\s*txHash, chainIdOverride \|\| settlementChainId/);
});

test('Investment history displays the hash even if the explorer cannot be resolved', () => {
  assert.match(purchasePage, /validTransactionHash\(rowPaymentHash\)\s*\?\s*\(/);
  assert.match(purchasePage, /<strong title=\{rowPaymentHash\}>\{shortHash\(rowPaymentHash\)\}<\/strong>/);
});

test('Redemption history links payment hashes to the transaction network and falls back to text', () => {
  assert.match(redemptionPage, /redemption\?\.payment\?\.transactionHash/);
  assert.match(redemptionPage, /row\?\.chainId \|\| settlementChainId/);
  assert.match(redemptionPage, /transactionExplorerUrl\(rowPaymentHash, rowChainId\)/);
  assert.match(redemptionPage, /rowPaymentHash \? <strong title=\{rowPaymentHash\}>/);
});

test('Explorer utility only generates transaction links for valid hashes and http(s) URLs', () => {
  assert.match(explorer, /isValidTransactionHash\(normalizedHash\)/);
  assert.match(explorer, /resolveChainExplorerUrl/);
  assert.match(explorer, /if \(!\/\^https\?:/);
});
