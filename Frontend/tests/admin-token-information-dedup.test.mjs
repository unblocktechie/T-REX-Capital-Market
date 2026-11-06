import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/admin/AdminMonitoringDetailDialogs.jsx', import.meta.url), 'utf8');
const overview = source.slice(source.indexOf('function TokenOverview'), source.indexOf('function TokenInvestorsPagination'));
const modal = source.slice(source.indexOf('export function AdminTokenDetailsDialog'), source.indexOf('const sortEvents'));

test('asset identity, status, prices and contract live in a single always-visible responsive overview', () => {
  assert.match(modal, /<TokenOverview token={token} chains={chains} paymentSymbol={paymentSymbol} investorCount={investedCount}/);
  for (const field of ['token.tokenName', 'token.tokenSymbol', 'token.chainName', 'token.legalCompanyName', 'token.status']) {
    assert.match(overview, new RegExp(field.replaceAll('.', '\\.')));
  }
  assert.match(overview, /lg:grid-cols-4/);
  assert.doesNotMatch(modal, /tab === 'details'|>Token information<|<TokenInformation/);
  assert.match(modal, /tab === 'investors'/);
  assert.match(modal, /tab === 'history'/);
});

test('initial and current price use the precise price component with full timestamps', () => {
  assert.match(overview, /Current price/);
  assert.match(overview, /Initial price/);
  assert.match(overview, /<PriceValue value={price} label={label}/);
  assert.match(overview, /token\.currentTokenPriceAt/);
  assert.match(overview, /token\.initialTokenPriceAt/);
  assert.match(overview, /<time dateTime={at} title={when\(at\)}/);
});

test('contract copy and chain-resolved explorer link are available without another tab', () => {
  assert.match(overview, /tokenContractExplorer\(token, chains\)/);
  assert.match(overview, /<span className="font-semibold text-slate-600">Token<\/span>/);
  assert.match(overview, /Deployed on/);
  assert.match(overview, /<CompactAddress value={token\.tokenAddress}/);
  assert.match(overview, /<a href={contractLink} target="_blank"/);
  assert.doesNotMatch(overview, /<CompactAddress[^>]+href=/);
  assert.match(overview, /<time dateTime={deployedAt}/);
});
