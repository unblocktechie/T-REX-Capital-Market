const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenPriceUpdateService } = require('../../src/services/token-price-update.service');
const { TokenPriceUpdateRepository } = require('../../src/repositories/token-price-update.repository');
test('MetaMask rejection cancels without RPC, retry method is disabled, hashes are protected', async () => {
  let called = 0;
  const row = { tokenUid: 't', organizationUid: 'o', chainUid: 'c', submissionMode: 'DIRECT' };
  const service = new TokenPriceUpdateService({ repository: { findByUid: async () => row,
    cancelDirect: async () => { called++; return { status: 'CANCELLED', errorCode: 'USER_CANCELLED' }; } },
    transactionRunner: work => work({}), dependencies: { providerFactory: () => { throw Error('must not call RPC'); } } });
  service.context = async () => ({ token: { tokenUid: 't' }, organization: { organizationUid: 'o' }, config: { chainUid: 'c' } });
  assert.equal((await service.cancelDirect({}, 'p', {})).status, 'CANCELLED');
  assert.equal(service.recoverDirect, undefined);
  row.transactionHash = 'known'; await assert.rejects(service.cancelDirect({}, 'p', {}));
  assert.equal(called, 1);
  row.transactionHash = null; row.organizationUid = 'other'; await assert.rejects(service.cancelDirect({}, 'p', {}));
});
test('expiry only targets pending manual rows without hash and uses DB timeout', async () => {
  const sql = [];
  await new TokenPriceUpdateRepository().expireUnsignedPending(1, { execute: async q => { sql.push(q); return [{ affectedRows: 1 }]; } });
  assert.match(sql[0], /status='EXPIRED'/);
  assert.match(sql[0], /submissionMode='DIRECT' AND status='PENDING' AND transactionHash IS NULL/);
  assert.match(sql[0], /TokenPriceManualPendingExpirySeconds/);
  assert.match(sql[0], /1800/);
});
test('late successful event matcher includes expired intents', async () => {
  const sql = [];
  const repo = new TokenPriceUpdateRepository(); repo.findByUid = async () => ({});
  await repo.confirmEvent({ tokenUid: 't', chainUid: 'c', chainId: 1, submissionMode: 'DIRECT', directTransactionNonce: 7,
    transactionHash: 'h', newPriceRaw: '2', oldPriceRaw: '1' }, { execute: async q => {
    sql.push(q); return [q.includes("status IN ('PENDING','SUBMITTED','EXPIRED')") ? [{ tokenUid: 't', chainUid: 'c', priceUpdateUid: 'p' }] : []];
  } });
  assert.ok(sql.some(q => q.includes("status IN ('PENDING','SUBMITTED','EXPIRED')")));
  assert.ok(!sql.some(q => q.startsWith('INSERT')));
});
