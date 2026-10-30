import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveChainExplorerUrl } from '../src/utils/chainExplorerOverrides.js';

const hash = `0x${'a'.repeat(64)}`;
const urlFor = (chainId, fallback) => `${resolveChainExplorerUrl(chainId, fallback).replace(/\/$/, '')}/tx/${hash}`;

test('Robinhood mainnet transactions use robin.etherscan.io regardless of stale backend configuration', () => {
  assert.equal(urlFor(4663, 'https://arbiscan.io'), `https://robin.etherscan.io/tx/${hash}`);
  assert.equal(urlFor('4663', ''), `https://robin.etherscan.io/tx/${hash}`);
});

test('Robinhood testnet transactions are not incorrectly linked to Robinhood mainnet', () => {
  assert.equal(urlFor(46630, 'https://arbiscan.io'), `https://explorer.testnet.chain.robinhood.com/tx/${hash}`);
});

test('Arc and Arbitrum explorer URLs remain unchanged', () => {
  assert.equal(resolveChainExplorerUrl(5042002, 'https://testnet.arcscan.app'), 'https://testnet.arcscan.app');
  assert.equal(resolveChainExplorerUrl(421614, 'https://sepolia.arbiscan.io'), 'https://sepolia.arbiscan.io');
});

test('web3 chain normalization applies the override before building wallet and transaction links', () => {
  const web3Source = readFileSync(new URL('../src/config/web3.js', import.meta.url), 'utf8');
  assert.match(web3Source, /import \{ resolveChainExplorerUrl \} from '@\/utils\/chainExplorerOverrides';/);
  assert.match(web3Source, /explorerUrl: resolveChainExplorerUrl\(chainId, row\.explorerUrl\)/);
});
