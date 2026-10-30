import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  resolveIssuerTokenHistoryChainId,
  resolveIssuerTransactionChainId,
} from '../src/utils/issuerTransactionChain.js';

const chains = [
  { chainUid: 'arbitrum', chainId: 421614, explorerUrl: 'https://arb.example' },
  { chainUid: 'arc', chainId: 5042002, explorerUrl: 'https://arc.example' },
  { chainUid: 'robinhood', chainId: 46630, explorerUrl: 'https://robinhood.example' },
];
const hash = `0x${'a'.repeat(64)}`;

const explorerLink = (row, tokenChainId) => {
  const id = resolveIssuerTransactionChainId(row, tokenChainId, chains);
  const explorer = chains.find((chain) => chain.chainId === id)?.explorerUrl;
  return explorer ? `${explorer}/tx/${hash}` : '';
};

test('Arc token records resolve from the persisted chain UID, not the default Arbitrum chain', () => {
  const chainId = resolveIssuerTokenHistoryChainId({ tokenInformation: { chainUid: 'arc' } }, chains);
  assert.equal(chainId, 5042002);
  assert.equal(explorerLink({}, chainId), `https://arc.example/tx/${hash}`);
});

test('Robinhood token records resolve from their numeric deployment chain', () => {
  const chainId = resolveIssuerTokenHistoryChainId({ deployment: { chainId: 46630 } }, chains);
  assert.equal(chainId, 46630);
  assert.equal(explorerLink({}, chainId), `https://robinhood.example/tx/${hash}`);
});

test('nested token-information and network chain IDs are supported', () => {
  assert.equal(resolveIssuerTokenHistoryChainId({ tokenInformation: { chainId: '46630' } }, chains), 46630);
  assert.equal(resolveIssuerTokenHistoryChainId({ information: { network: { chainId: 5042002 } } }, chains), 5042002);
});

test('transaction chain ID overrides the token chain for individually indexed rows', () => {
  const tokenChainId = resolveIssuerTokenHistoryChainId({ tokenInformation: { chainUid: 'arc' } }, chains);
  assert.equal(explorerLink({ chainId: 46630 }, tokenChainId), `https://robinhood.example/tx/${hash}`);
  assert.equal(explorerLink({ chainId: 421614 }, tokenChainId), `https://arb.example/tx/${hash}`);
});

test('transaction chain UID takes priority over fallback token chain if numeric ID is absent', () => {
  assert.equal(explorerLink({ chainUid: 'robinhood' }, 5042002), `https://robinhood.example/tx/${hash}`);
  assert.equal(explorerLink({ network: { chainUid: 'arc' } }, 421614), `https://arc.example/tx/${hash}`);
});

test('unknown or invalid network metadata cannot silently produce Arbitrum links', () => {
  assert.equal(resolveIssuerTokenHistoryChainId({}, chains), null);
  assert.equal(resolveIssuerTransactionChainId({ chainId: 'bad' }, null, chains), null);
  assert.equal(explorerLink({}, null), '');
  assert.equal(resolveIssuerTokenHistoryChainId({ tokenInformation: { chainUid: 'unknown' } }, chains), null);
  assert.equal(resolveIssuerTransactionChainId({ chainId: -1, chainUid: 'arc' }, null, chains), 5042002);
});

test('issuer activity component uses the individual row chain and disables unknown-chain links', () => {
  const pageSource = readFileSync(new URL('../src/pages/issuer/IssuerTransactionHistoryPage.jsx', import.meta.url), 'utf8');
  assert.match(pageSource, /render: \(value, row\) => \{\s*const transactionChainId = row\?\.chainId \|\| history\.chainId;/);
  assert.match(pageSource, /href=\{transactionChainId \? transactionExplorerUrl\(value, transactionChainId\) : ''\}/);
  assert.doesNotMatch(pageSource, /href=\{transactionExplorerUrl\(value, history\.chainId\)\}/);
});

test('issuer history service resolves token and row networks from API metadata', () => {
  const serviceSource = readFileSync(new URL('../src/services/issuer/issuerTokenTransactionHistory.service.js', import.meta.url), 'utf8');
  assert.match(serviceSource, /chainId: resolveIssuerTransactionChainId\(row, fallbackChainId, web3Config\.chainRecords\)/);
  assert.match(serviceSource, /resolveIssuerTokenHistoryChainId\(token, web3Config\.chainRecords, chainId\)/);
  assert.doesNotMatch(serviceSource, /web3Config\.requiredChain\.id/);
});
