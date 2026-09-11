const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const { TokenRedemptionService } = require('../../src/services/token-redemption.service');

const address = (char) => ethers.getAddress(`0x${char.repeat(40)}`);
const TOKEN = address('1'); const INVESTOR = address('2'); const TREASURY = address('3');
const PLATFORM = address('4'); const USDT = address('5');

const context = {
  interestUid: 'interest-1', interestStatus: 'registered', tokenUid: 'token-1', organizationUid: 'org-1',
  investorUid: 'investor-1', investorUserUid: 'user-1', investorWalletAddress: INVESTOR,
  investorStatus: 'submitted', investorActive: true, investorDeleted: false, tokenAddress: TOKEN,
  treasuryWalletAddress: TREASURY, tokenDecimals: 2, tokenPrice: '10', tokenStatus: 'deployed',
  tokenActive: true, issuerUserUid: 'issuer-1', organizationStatus: 'approved', organizationActive: true,
  hasActivePurchase: false,
};

test('creates a backend-authoritative redemption intent and returns typed authorization data', async () => {
  let saved;
  const repository = {
    findByIdempotency: async () => null, findContext: async () => context, findActiveByInterest: async () => null,
    create: async (data) => {
      saved = { redemptionUid: 'redemption-1', status: 'PENDING_INVESTOR_AUTHORIZATION',
        lockStatus: 'NOT_STARTED', paymentStatus: 'NOT_STARTED', burnStatus: 'NOT_STARTED', unlockStatus: 'NOT_STARTED',
        syncStatus: 'IDLE', syncAttempts: 0, createdAt: new Date(), updatedAt: new Date(), ...data };
      return saved;
    },
    addHistory: async () => {},
  };
  const blockchain = {
    prepare: async () => ({ chainId: 11155111, usdtDecimals: 6, balanceBeforeRaw: '1000', frozenBeforeRaw: '0',
      totalSupplyBeforeRaw: '10000', platformWalletAddress: PLATFORM, platformIsAgent: true, preparedAtBlock: 100 }),
    authorizationPayload: (row) => ({ message: { redemptionUid: row.redemptionUid, tokenAmountRaw: row.tokenAmountRaw } }),
  };
  const service = new TokenRedemptionService({ repository, blockchain, executionService: {},
    config: { redemptionUsdtAddress: USDT, redemptionAuthorizationTtlMinutes: 30 }, transactionRunner: (work) => work({}) });
  const result = await service.create({ userUid: 'user-1', roleName: 'Investor' }, 'token-1', {
    tokenAmount: '2.5', idempotencyKey: 'redeem-001',
  });
  assert.equal(result.redemption.tokenAmountRaw, '250');
  assert.equal(result.redemption.usdtAmountRaw, '25000000');
  assert.equal(result.redemption.authorization.typedData.message.redemptionUid, 'redemption-1');
  assert.equal(saved.issuerPaymentWalletAddress, TREASURY);
});

test('redemption cannot exceed the investor unfrozen token balance', async () => {
  const repository = {
    findByIdempotency: async () => null, findContext: async () => context, findActiveByInterest: async () => null,
  };
  const service = new TokenRedemptionService({ repository, executionService: {},
    blockchain: { prepare: async () => ({ chainId: 11155111, usdtDecimals: 6, balanceBeforeRaw: '1000',
      frozenBeforeRaw: '900', totalSupplyBeforeRaw: '10000', platformWalletAddress: PLATFORM,
      platformIsAgent: true, preparedAtBlock: 100 }) }, config: { redemptionUsdtAddress: USDT } });
  await assert.rejects(service.create({ userUid: 'user-1', roleName: 'Investor' }, 'token-1', {
    tokenAmount: '2', idempotencyKey: 'redeem-002',
  }), (error) => error.code === 'INSUFFICIENT_AVAILABLE_TOKEN_BALANCE');
});

test('redemption payout is calculated from the current snapshotted token price', async () => {
  let saved;
  const repository = {
    findByIdempotency: async () => null,
    findContext: async () => ({ ...context, tokenPrice: '12.5' }),
    findActiveByInterest: async () => null,
    create: async (data) => {
      saved = { redemptionUid: 'redemption-current-price', status: 'PENDING_INVESTOR_AUTHORIZATION',
        lockStatus: 'NOT_STARTED', paymentStatus: 'NOT_STARTED', burnStatus: 'NOT_STARTED',
        unlockStatus: 'NOT_STARTED', syncStatus: 'IDLE', syncAttempts: 0, ...data };
      return saved;
    },
    addHistory: async () => {},
  };
  const blockchain = {
    prepare: async () => ({ chainId: 11155111, usdtDecimals: 6, balanceBeforeRaw: '1000',
      frozenBeforeRaw: '0', totalSupplyBeforeRaw: '10000', platformWalletAddress: PLATFORM,
      platformIsAgent: true, preparedAtBlock: 100 }),
    authorizationPayload: () => ({}),
  };
  const service = new TokenRedemptionService({ repository, blockchain, executionService: {},
    config: { redemptionUsdtAddress: USDT }, transactionRunner: (work) => work({}) });
  const result = await service.create({ userUid: 'user-1', roleName: 'Investor' }, 'token-1', {
    tokenAmount: '2', idempotencyKey: 'redeem-current-price',
  });
  assert.equal(result.redemption.tokenPrice, '12.5');
  assert.equal(result.redemption.usdtAmount, '25.0');
});

test('issuer redemption detail includes the investor name', async () => {
  const repository = {
    findIssuerOwned: async () => ({
      redemptionUid: 'redemption-1', interestUid: 'interest-1', tokenUid: 'token-1',
      investorName: 'Jane Investor', status: 'TOKENS_LOCKED', chainId: 11155111,
      tokenAddress: TOKEN, usdtContractAddress: USDT, investorWalletAddress: INVESTOR,
      issuerPaymentWalletAddress: TREASURY, platformWalletAddress: PLATFORM,
      tokenAmount: '2.5', tokenAmountRaw: '250', tokenDecimals: 2, tokenPrice: '10',
      usdtAmount: '25', usdtAmountRaw: '25000000', usdtDecimals: 6,
      authorizationSignature: '0xsigned', authorizedAt: new Date(), authorizationDeadline: new Date(),
      lockStatus: 'CONFIRMED', paymentStatus: 'AWAITING_ISSUER', burnStatus: 'NOT_STARTED',
      unlockStatus: 'NOT_STARTED', syncStatus: 'IDLE', syncAttempts: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }),
    listHistory: async () => [],
    listTransactions: async () => [],
  };
  const service = new TokenRedemptionService({ repository, blockchain: {}, executionService: {} });

  const result = await service.getIssuer({ userUid: 'issuer-1', roleName: 'Issuer' }, 'redemption-1');

  assert.equal(result.investorName, 'Jane Investor');
});
