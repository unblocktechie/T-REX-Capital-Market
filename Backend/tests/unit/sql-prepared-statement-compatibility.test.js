const test = require('node:test');
const assert = require('node:assert/strict');
const { sqlInteger } = require('../../src/utils/sql');
const { TokenPurchaseRepository } = require('../../src/repositories/token-purchase.repository');
const { TokenRedemptionRepository } = require('../../src/repositories/token-redemption.repository');
const { InvestorClaimSubmissionRepository } = require('../../src/repositories/investor-claim-submission.repository');
const { BlockchainTransactionRepository } = require('../../src/repositories/blockchain-transaction.repository');

const captureExecutor = () => {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [[]];
    },
  };
};

test('sqlInteger produces safe numeric SQL literals and rejects non-integers', () => {
  assert.equal(sqlInteger(200, { min: 1 }), '200');
  assert.equal(sqlInteger('25', { min: 1 }), '25');
  assert.throws(() => sqlInteger('20; DROP TABLE userMaster'), TypeError);
  assert.throws(() => sqlInteger(-1), TypeError);
});

test('canonical transaction upsert binds exactly one value for every placeholder', async () => {
  const executor = captureExecutor();
  await new BlockchainTransactionRepository().upsert({
    chainId: 11155111, tokenUid: 'token-1', organizationUid: 'org-1', tokenAddress: '0x1',
    transactionHash: `0x${'a'.repeat(64)}`, type: 'TRANSFER', initiatedByWallet: '0x2',
    status: 'SUBMITTED',
  }, executor);
  assert.equal(executor.calls.length, 2);
  for (const call of executor.calls) {
    assert.equal(call.params.length, (call.sql.match(/\?/g) || []).length);
  }
});

test('reconciliation repository limits are sanitized literals, not prepared-statement parameters', async () => {
  const executor = captureExecutor();
  await new TokenPurchaseRepository().listPaymentEvents(11155111, 200, executor);
  await new TokenRedemptionRepository().listPaymentEvents(11155111, 200, executor);
  await new InvestorClaimSubmissionRepository().findRecoveryCandidates(100, executor);

  assert.equal(executor.calls.length, 3);
  for (const call of executor.calls) {
    assert.doesNotMatch(call.sql, /LIMIT\s+\?/i);
    assert.match(call.sql, /LIMIT\s+(?:100|200)\b/i);
    const placeholderCount = (call.sql.match(/\?/g) || []).length;
    assert.equal(call.params.length, placeholderCount);
  }
});
