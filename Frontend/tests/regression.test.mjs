import assert from 'node:assert/strict';
import test from 'node:test';
import { beneficialOwnerSchema, beneficialOwnersSchema } from '../src/validations/organization.schemas.js';
import { complianceSchema } from '../src/validations/investor.schemas.js';
import { mapTokenForm, toCompliancePayload } from '../src/api/tokens/token.mapper.js';
import { mapMarketplaceToken } from '../src/api/investments/investment.mapper.js';
import {
  buildReviewChecklist,
  validateCompliance,
  validateTokenInformation,
} from '../src/utils/tokenIssuance.js';
import { getInvestmentJourney } from '../src/utils/investmentJourney.js';
import { getRetryAfterMs, getRetryDelayMs, retryAsync, wait } from '../src/utils/retry.js';
import { getWalletFundingIssue } from '../src/utils/walletFunding.js';
import { portfolioAssetKey } from '../src/utils/portfolioAssetKey.js';

const owner = (percentage, id = 'owner') => ({
  id, fullName: 'Sample Owner', dateOfBirth: '1990-01-01',
  nationality: 'IN', ownershipPercentage: percentage,
});
const compliance = (categories, years) => ({
  sourceOfWealth: 'salary', estimatedNetWorth: 'medium', annualInvestmentCapacity: 'medium',
  investmentCategories: categories, yearsOfExperience: years, previousRwaExperience: 'no',
  accreditationType: 'accredited', accreditationDocuments: [{
    id: 'doc', name: 'certificate.pdf', size: 100, type: 'application/pdf',
    status: 'success', documentType: 'certificate',
  }],
});
const none = '__no_investment_experience__';

test('ownership must exceed 1% and have at most two decimal places', () => {
  for (const invalid of ['0', '1', '1.001', '25.123', '101']) {
    assert.equal(beneficialOwnerSchema.safeParse(owner(invalid)).success, false, invalid);
  }
  for (const valid of ['1.01', '33.33', '100']) {
    assert.equal(beneficialOwnerSchema.safeParse(owner(valid)).success, true, valid);
  }
});

test('ownership total is exactly 100%, including decimal splits', () => {
  const parse = (values) => beneficialOwnersSchema.safeParse({
    beneficialOwners: values.map((value, index) => owner(value, String(index))),
  }).success;
  assert.equal(parse(['33.33', '33.33', '33.34']), true);
  assert.equal(parse(['50', '49.99']), false);
  assert.equal(parse(['50', '50.0001']), false);
});

test('None cannot coexist with another experience category', () => {
  assert.equal(complianceSchema.safeParse(compliance([none, 'stocks'], '0')).success, false);
  assert.equal(complianceSchema.safeParse(compliance([none], '0')).success, true);
});

test('None requires zero years, and saved zero-experience empty categories remain valid', () => {
  assert.equal(complianceSchema.safeParse(compliance([none], '3')).success, false);
  assert.equal(complianceSchema.safeParse(compliance([], '0')).success, true);
  assert.equal(complianceSchema.safeParse(compliance([], '3')).success, false);
});

test('country keys survive JSON serialization when empty, in draft and final saves', () => {
  for (const draft of [false, true]) {
    const data = { maximumInvestors: '500', maximumBalance: '100', countries: [] };
    assert.deepEqual(validateCompliance(data), {});
    const payload = JSON.parse(JSON.stringify(toCompliancePayload(data, draft)));
    assert.deepEqual(payload.countryUids, []);
    assert.equal(payload.countryRestrictionMode, 'blocklist');
    assert.equal(payload.isDraft, draft);
    assert.deepEqual(toCompliancePayload({ ...data, countries: [{ countryUid: 'country-1' }] }).countryUids, ['country-1']);
    assert.ok(validateCompliance({ ...data, maximumInvestors: '0' }).maximumInvestors);
    assert.ok(validateCompliance({ ...data, countries: [{ countryName: 'Invalid' }] }).countries);
  }
});

test('issuer rejection is terminal and does not demand another issuer action', () => {
  const journey = getInvestmentJourney({ status: 'rejected', viewerRole: 'issuer' });
  assert.equal(journey.statusLabel, 'Rejected');
  assert.equal(journey.terminal, true);
  assert.equal(journey.stages.some((stage) => stage.state === 'attention'), false);
});

test('rate limiting respects the server Retry-After minimum', () => {
  const error = { response: { status: 429, headers: { 'retry-after': '30' } } };
  assert.equal(getRetryAfterMs(error), 30000);
  assert.equal(getRetryDelayMs(error, 1, { maxDelayMs: 10000 }), 30000);
});

test('transient operations retry only up to the configured maximum', async () => {
  let calls = 0;
  const error = Object.assign(new Error('Busy'), { status: 429 });
  await assert.rejects(retryAsync(async () => { calls += 1; throw error; }, {
    maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1,
  }));
  assert.equal(calls, 3);
  assert.equal(error.__retryExhausted, true);
  calls = 0;
  await assert.rejects(retryAsync(async () => {
    calls += 1;
    throw Object.assign(new Error('Invalid request'), { status: 400 });
  }));
  assert.equal(calls, 1);
});

test('aborting a retry wait stops it immediately', async () => {
  const controller = new globalThis.AbortController();
  const pending = wait(10000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('funding messages distinguish USDT shortages from Sepolia ETH fees', () => {
  const context = { paymentSymbol: 'USDT', nativeSymbol: 'ETH', networkName: 'Sepolia' };
  assert.equal(getWalletFundingIssue({ code: 'INSUFFICIENT_INVESTOR_BALANCE' }, context).type, 'payment');
  assert.equal(getWalletFundingIssue({ code: 'INSUFFICIENT_NATIVE_BALANCE' }, context).type, 'gas');
  const both = getWalletFundingIssue({ code: 'INSUFFICIENT_INVESTOR_BALANCE' }, {
    ...context, nativeBalance: { value: 0n },
  });
  assert.equal(both.type, 'both');
  assert.equal(both.paymentSymbol, 'USDT');
  assert.equal(both.nativeSymbol, 'ETH');
  assert.equal(both.networkName, 'Sepolia');
  assert.equal(getWalletFundingIssue({ code: 4001, message: 'User rejected the request' }, context), null);
});

test('partial portfolio records have independent keys without inventing token UIDs', () => {
  assert.notEqual(portfolioAssetKey({ symbol: 'ONE', name: 'One' }), portfolioAssetKey({ symbol: 'TWO', name: 'Two' }));
  assert.equal(portfolioAssetKey({ tokenUid: 'backend-id', tokenAddress: '0xABC' }), 'backend-id');
  assert.equal(portfolioAssetKey({ chainId: 11155111, tokenAddress: '0xABC' }), '11155111:0xabc');
});


test('persisted token image does not falsely block a refreshed draft', () => {
  const information = {
    logo: null,
    name: 'Sample Asset',
    symbol: 'SAMP',
    decimals: '18',
    treasuryWallet: '0x0000000000000000000000000000000000000001',
    description: 'A complete saved token draft.',
  };
  const pricing = {
    paymentTokenAddress: '0x0000000000000000000000000000000000000002',
    initialPrice: '1',
  };

  assert.ok(validateTokenInformation(information, pricing).logo);
  assert.equal(
    validateTokenInformation(information, pricing, { imageAvailable: true }).logo,
    undefined,
  );
});

test('review checklist accepts backend-authoritative saved image after refresh', () => {
  const walletAddress = '0x0000000000000000000000000000000000000001';
  const state = {
    tokenInformation: {
      logo: null,
      name: 'Sample Asset',
      symbol: 'SAMP',
      decimals: '18',
      treasuryWallet: walletAddress,
      description: 'A complete saved token draft.',
    },
    supplyPricing: {
      paymentTokenAddress: '0x0000000000000000000000000000000000000002',
      initialPrice: '1',
    },
    identityClaims: {
      claimTopics: [{ id: 'kyc', enabled: true, claimTopicUid: 'claim-1' }],
      trustedIssuer: { mode: 'organization', address: walletAddress },
    },
    compliance: { maximumInvestors: '100', maximumBalance: '10', countries: [] },
    agents: {
      tokenAgent: { address: walletAddress },
      identityRegistryAgent: { address: walletAddress },
    },
  };
  const wallet = {
    isConnected: true,
    isCorrectNetwork: true,
    address: walletAddress,
  };

  const withoutPersistedImage = buildReviewChecklist(state, wallet, walletAddress);
  assert.equal(withoutPersistedImage.find((item) => item.id === 'token-metadata').status, 'error');

  const withPersistedImage = buildReviewChecklist(state, wallet, walletAddress, {
    imageAvailable: true,
  });
  assert.equal(withPersistedImage.find((item) => item.id === 'token-metadata').status, 'valid');
  assert.equal(withPersistedImage.find((item) => item.id === 'contract-configuration').status, 'valid');
});


test('backend step progression preserves saved-image authority when image blob is not returned', () => {
  const mapped = mapTokenForm({
    data: {
      tokenUid: 'token-1',
      currentStep: 'review',
      status: 'draft',
      tokenName: 'Sample Asset',
      tokenSymbol: 'SAMP',
    },
    options: { claimTopics: [] },
    countries: [],
    logo: null,
  });

  assert.equal(mapped.completedSteps.includes('token-information'), true);
  assert.equal(mapped.server.imageAvailable, true);
});


test('marketplace mapping preserves nested token and selected-chain payment context', () => {
  const mapped = mapMarketplaceToken({
    tokenUid: 'token-1',
    chainUid: 'chain-1',
    chainId: 46630,
    tokenInformation: {
      tokenName: 'HoodBird',
      tokenSymbol: 'HBIRD',
      paymentTokenAddress: '0x0000000000000000000000000000000000000002',
      paymentTokenSymbol: 'USDG',
    },
  });

  assert.equal(mapped.name, 'HoodBird');
  assert.equal(mapped.symbol, 'HBIRD');
  assert.equal(mapped.chainUid, 'chain-1');
  assert.equal(mapped.chainId, 46630);
  assert.equal(mapped.paymentTokenAddress, '0x0000000000000000000000000000000000000002');
  assert.equal(mapped.currency, 'USDG');
});
