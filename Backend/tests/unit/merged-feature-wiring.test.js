const test = require('node:test');
const assert = require('node:assert/strict');

test('merged backend initializes bot, price indexer, holder counts and application journey together', () => {
  // Loading dependencies must not start runners or send blockchain transactions.
  // This catches deleted initialization blocks that isolated service tests cannot.
  const dependencies = require('../../src/dependencies');
  assert.ok(dependencies.services.issuerApiKeyService);
  assert.ok(dependencies.services.tokenPriceUpdateService);
  assert.ok(dependencies.jobs.tokenPriceIndexerRunner);
  assert.equal(typeof dependencies.issuerPriceAuthenticate, 'function');
  const investment = dependencies.services.investmentService;
  assert.equal(typeof investment.getHolderSummary, 'function');
  assert.ok(investment.journeyService);
  assert.equal(dependencies.services.investorClaimService.journeyService, investment.journeyService);
  assert.equal(dependencies.services.identityRegistryRegistrationService.journeyService, investment.journeyService);
  assert.equal(dependencies.services.claimRecoveryService.journeyService, investment.journeyService);
});
