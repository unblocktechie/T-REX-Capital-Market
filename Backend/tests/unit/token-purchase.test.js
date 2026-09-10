const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenPurchaseService, ceilDiv } = require('../../src/services/token-purchase.service');
const { PurchaseBlockchainError } = require('../../src/services/blockchain/token-purchase-blockchain.service');

const investor = { userUid: 'user-1', roleName: 'Investor' };
const address = (char) => `0x${char.repeat(40)}`;
const TX = `0x${'a'.repeat(64)}`;

const context = {
  interestUid: 'interest-1', interestStatus: 'registered', organizationUid: 'org-1', investorUid: 'investor-1',
  investorUserUid: investor.userUid, investorWalletAddress: address('1'), investorStatus: 'submitted',
  investorActive: true, investorDeleted: false, tokenUid: 'token-1', tokenAddress: address('2'),
  treasuryWalletAddress: address('3'), tokenDecimals: 18, tokenPrice: '1.5', maxBalancePerInvestor: '1000',
  tokenStatus: 'deployed', tokenActive: true,
};

const make = (over = {}) => {
  const state = { row: over.row || null, transactions: [], context: over.context || context };
  const repository = {
    findByIdempotency: async () => over.idempotent || null,
    findContext: async () => state.context,
    findActiveByInterest: async () => over.active || null,
    findActiveByInvestor: async () => over.investorActivePurchase || null,
    sumOpenTokenAmountRaw: async () => '0',
    create: async (data) => {
      state.row = { purchaseUid: 'purchase-1', status: 'PENDING_PAYMENT', mintStatus: 'NOT_STARTED', syncStatus: 'IDLE', syncAttempts: 0, ...data };
      return state.row;
    },
    findOwnedByUid: async () => state.row,
    listOwnedByToken: async (userUid, tokenUid, options) => {
      state.historyRequest = { userUid, tokenUid, options };
      return { rows: over.historyRows || [], total: (over.historyRows || []).length };
    },
    listPortfolio: async (userUid, options) => {
      state.portfolioRequest = { userUid, options };
      return { rows: over.portfolioRows || [], total: (over.portfolioRows || []).length };
    },
    findByUid: async () => state.row,
    findByPaymentTxHash: async () => null,
    assignPaymentHash: async (uid, txHash) => { state.row.paymentTxHash = txHash; state.row.paymentTxReceivedAt = new Date(); return state.row; },
    confirmPayment: async (uid, data) => { state.row = { ...state.row, status: 'PAYMENT_CONFIRMED', mintStatus: 'QUEUED', ...{
      paymentBlockNumber: data.blockNumber, paymentBlockHash: data.blockHash, paymentTransactionIndex: data.transactionIndex,
      paymentLogIndex: data.logIndex, paymentGasUsed: data.gasUsed, paymentEffectiveGasPrice: data.effectiveGasPrice,
      paymentVerifiedAt: new Date(),
    } }; return true; },
    recordTransaction: async (uid, stage, txHash, status) => { state.transactions.push({ uid, stage, txHash, status }); },
    recordError: async (uid, stage, code, message, retrySeconds) => { state.row = { ...state.row, errorStage: stage, errorCode: code, errorMessage: message, nextSyncAt: retrySeconds === null ? null : new Date() }; },
    schedulePending: async () => { state.row = { ...state.row, syncStatus: 'QUEUED', errorStage: null, errorCode: null, errorMessage: null, nextSyncAt: new Date() }; return state.row; },
    listTransactions: async () => state.transactions,
    queue: async () => state.row,
    resetFailedMint: async () => { state.row.status = 'PAYMENT_CONFIRMED'; state.row.mintTxHash = null; },
  };
  const blockchain = over.blockchain || {
    prepare: async () => ({ chainId: 11155111, usdtDecimals: 6, balanceBeforeRaw: '0', platformWalletAddress: address('4'), platformIsAgent: true, preparedAtBlock: 100 }),
    verifyPayment: async (txHash) => ({ txHash, blockNumber: 110, blockHash: `0x${'b'.repeat(64)}`, transactionIndex: 1, logIndex: 2, gasUsed: '50000', effectiveGasPrice: '10' }),
  };
  const mintService = over.mintService || {
    submit: async (row, options = {}) => {
      const txHash = `0x${'c'.repeat(64)}`;
      state.row = {
        ...state.row,
        status: options.confirmImmediately ? 'COMPLETED' : 'MINT_SUBMITTED',
        mintStatus: options.confirmImmediately ? 'CONFIRMED' : 'SUBMITTED',
        mintTxHash: txHash,
        ...(options.confirmImmediately ? { mintBlockNumber: 111, mintTransactionIndex: 1, mintLogIndex: 2, mintGasUsed: '90000' } : {}),
      };
      state.transactions.push({ uid: state.row.purchaseUid, stage: 'MINT', txHash, status: 'SUBMITTED' });
      return { row: state.row, submitted: true, confirmed: Boolean(options.confirmImmediately), pending: false };
    },
  };
  return { state, repository, service: new TokenPurchaseService({
    repository, blockchain, mintService,
    investmentRepository: { listCountryRestrictionsForTokens: async () => over.restrictions || [] },
    tokenRepository: { listClaimTopics: async () => over.claimTopics || [] },
    config: { purchaseUsdtAddress: address('5'), purchasePaymentConfirmations: 1 },
    transactionRunner: (work) => work({}),
  }) };
};

test('ceilDiv rounds a fractional USDT base-unit calculation upward', () => {
  assert.equal(ceilDiv(10n, 3n), 4n);
});

test('creates authoritative pending purchase amounts and payment parameters', async () => {
  const { service, state } = make();
  const result = await service.create(investor, 'token-1', { tokenAmount: '10.25', idempotencyKey: 'checkout-123' });
  assert.equal(result.purchase.status, 'PENDING_PAYMENT');
  assert.equal(result.purchase.tokenAmount, '10.25');
  assert.equal(result.purchase.usdtAmount, '15.375');
  assert.equal(result.purchase.usdtAmountRaw, '15375000');
  assert.equal(state.row.investorWalletAddress, context.investorWalletAddress);
  assert.equal(state.row.treasuryWalletAddress, context.treasuryWalletAddress);
  assert.ok(state.row.expiresAt instanceof Date);
  assert.ok(state.row.expiresAt.getTime() > Date.now());
  assert.equal(result.purchase.expiration.expiresAt, state.row.expiresAt);
});

test('purchase requires a registered interest and platform Token Agent', async () => {
  const notRegistered = make({ context: { ...context, interestStatus: 'claimSubmitted' } });
  await assert.rejects(notRegistered.service.create(investor, 'token-1', { tokenAmount: '1', idempotencyKey: 'checkout-123' }),
    (error) => error.code === 'INVESTOR_NOT_REGISTERED');
  const noAgent = make({ blockchain: { prepare: async () => ({ chainId: 11155111, usdtDecimals: 6, balanceBeforeRaw: '0', platformWalletAddress: address('4'), platformIsAgent: false, preparedAtBlock: 1 }) } });
  await assert.rejects(noAgent.service.create(investor, 'token-1', { tokenAmount: '1', idempotencyKey: 'checkout-123' }),
    (error) => error.code === 'PLATFORM_NOT_TOKEN_AGENT');
});

test('returns existing purchase for the same idempotency key', async () => {
  const existing = { purchaseUid: 'purchase-old', status: 'PENDING_PAYMENT', tokenAmount: '1', tokenAmountRaw: '1', tokenDecimals: 18, tokenPrice: '1', usdtAmount: '1', usdtAmountRaw: '1', usdtDecimals: 6, chainId: 11155111, mintStatus: 'NOT_STARTED', syncStatus: 'IDLE' };
  const result = await make({ idempotent: existing }).service.create(investor, 'token-1', { tokenAmount: '999', idempotencyKey: 'checkout-123' });
  assert.equal(result.existing, true);
  assert.equal(result.purchase.purchaseUid, 'purchase-old');
});

test('confirms payment and completes the verified mint in the same API service call', async () => {
  const setup = make();
  await setup.service.create(investor, 'token-1', { tokenAmount: '2', idempotencyKey: 'checkout-123' });
  const result = await setup.service.confirm(investor, 'purchase-1', TX);
  assert.equal(result.purchase.status, 'COMPLETED');
  assert.equal(result.purchase.mintStatus, 'CONFIRMED');
  assert.equal(result.mintSubmitted, true);
  assert.equal(result.mintConfirmed, true);
  assert.deepEqual(setup.state.transactions.map((x) => x.status), ['RECEIVED', 'CONFIRMED', 'SUBMITTED']);
});

test('a not-yet-mined payment stays pending and is queued for recovery', async () => {
  const blockchain = {
    prepare: async () => ({ chainId: 11155111, usdtDecimals: 6, balanceBeforeRaw: '0', platformWalletAddress: address('4'), platformIsAgent: true, preparedAtBlock: 1 }),
    verifyPayment: async () => { throw new PurchaseBlockchainError('TRANSACTION_NOT_FOUND', 'not mined', { pending: true }); },
  };
  const setup = make({ blockchain });
  await setup.service.create(investor, 'token-1', { tokenAmount: '2', idempotencyKey: 'checkout-123' });
  const result = await setup.service.confirm(investor, 'purchase-1', TX);
  assert.equal(result.pendingVerification, true);
  assert.equal(result.purchase.status, 'PENDING_PAYMENT');
  assert.equal(result.purchase.synchronization.status, 'QUEUED');
  assert.equal(result.purchase.error, null);
});

test('confirm returns the persisted expired state while retry remains unavailable', async () => {
  const expired = {
    purchaseUid: 'purchase-1', status: 'EXPIRED', mintStatus: 'NOT_STARTED', syncStatus: 'IDLE',
    syncAttempts: 0, chainId: 11155111, expirationReason: 'PAYMENT_NOT_SUBMITTED',
  };
  const setup = make({ row: expired });
  const confirmed = await setup.service.confirm(investor, 'purchase-1', TX);
  assert.equal(confirmed.expired, true);
  assert.equal(confirmed.purchase.status, 'EXPIRED');
  assert.equal(confirmed.purchase.expiration.reason, 'PAYMENT_NOT_SUBMITTED');
  await assert.rejects(setup.service.retry(investor, 'purchase-1'),
    (error) => error.code === 'PURCHASE_EXPIRED' && error.statusCode === 409);
});

test('lists investor-owned purchase history with pagination, search, and status filters', async () => {
  const historyRows = [
    { purchaseUid: 'purchase-2', tokenUid: 'token-1', status: 'COMPLETED', chainId: 11155111, mintStatus: 'CONFIRMED', syncStatus: 'IDLE', syncAttempts: 1 },
    { purchaseUid: 'purchase-1', tokenUid: 'token-1', status: 'EXPIRED', chainId: 11155111, mintStatus: 'NOT_STARTED', syncStatus: 'IDLE', syncAttempts: 0 },
  ];
  const setup = make({ historyRows });
  const result = await setup.service.listByToken(investor, 'token-1', {
    page: 1, limit: 10, search: '0xabc', status: 'COMPLETED',
  });
  assert.deepEqual(result.items.map((item) => item.status), ['COMPLETED', 'EXPIRED']);
  assert.deepEqual(result.pagination, { page: 1, limit: 10, total: 2, totalPages: 1 });
  assert.deepEqual(setup.state.historyRequest, {
    userUid: investor.userUid,
    tokenUid: 'token-1',
    options: { page: 1, limit: 10, search: '0xabc', status: 'COMPLETED' },
  });
});

test('portfolio returns completed token metadata with purchase and redemption aggregates', async () => {
  const portfolioRows = [{
    tokenUid: 'token-1', organizationUid: 'org-1', tokenName: 'Acme Token', tokenSymbol: 'ACME',
    decimals: 2, initialTokenPrice: '190', imageStorageKey: 'acme.webp', imageMimeType: 'image/webp',
    status: 'deployed', chainId: 11155111, interestUid: 'interest-1', investorWalletAddress: address('1'),
    usdtContractAddress: address('5'), usdtDecimals: 6, purchaseCount: 3, redemptionCount: 1,
    totalPurchasedTokenAmount: '10.00', totalPurchasedTokenAmountRaw: '1000',
    totalInvestedUsdtAmount: '1900.00', totalInvestedUsdtAmountRaw: '1900000000',
    totalRedeemedTokenAmount: '2.00', totalRedeemedTokenAmountRaw: '200',
    netTokenAmount: '8.00', netTokenAmountRaw: '800', averagePurchasePrice: '190.00',
    firstPurchaseAt: new Date('2026-08-01T00:00:00Z'), latestPurchaseAt: new Date('2026-08-02T00:00:00Z'),
    latestRedemptionAt: new Date('2026-08-03T00:00:00Z'),
  }];
  const restriction = { tokenUid: 'token-1', countryUid: 'country-1', countryCode: 'IN', countryName: 'India', numericCode: '356' };
  const claimTopic = { claimTopicUid: 'claim-1', claimTopicCode: 'KYC', claimTopicName: 'KYC', value: 1 };
  const setup = make({ portfolioRows, restrictions: [restriction], claimTopics: [claimTopic] });
  const result = await setup.service.portfolio(investor, { page: 1, limit: 20, search: 'acme' });
  assert.equal(result.items[0].tokenName, 'Acme Token');
  assert.equal(result.items[0].imageUrl, '/api/v1/investments/tokens/token-1/image');
  assert.equal(result.items[0].chainId, 11155111);
  assert.equal(result.items[0].portfolio.totalPurchasedTokenAmount, '10.00');
  assert.equal(result.items[0].portfolio.netTokenAmount, '8.00');
  assert.equal(result.items[0].countryRestrictions[0].numericCode, '356');
  assert.equal(result.items[0].requiredClaimTopics[0].claimTopicCode, 'KYC');
  assert.deepEqual(setup.state.portfolioRequest, {
    userUid: investor.userUid, options: { page: 1, limit: 20, search: 'acme' },
  });
});
