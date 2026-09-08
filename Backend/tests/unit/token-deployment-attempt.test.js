const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { TokenDeploymentAttemptService } = require('../../src/services/token-deployment-attempt.service');
const { TokenService } = require('../../src/services/token.service');

const ORG_WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'a'.repeat(64)}`;
const TX_HASH_2 = `0x${'b'.repeat(64)}`;
const CHAIN_ID = 11155111;

const issuer = { userUid: 'user-1', roleName: 'Issuer' };
const organization = { organizationUid: 'org-1', status: 'approved', walletAddress: ORG_WALLET };

const runner = (work) => work({ connection: true });

const makeTokenRepo = (token) => ({
  token,
  async findForUpdateByUserUid() { return this.token; },
  async findByUserUid() { return this.token; },
  async updateByUserUid(userUid, fields) { Object.assign(this.token, fields); return { ...this.token }; },
  async findByDeployTxHashExcept() { return null; },
  async findByTokenAddressExcept() { return null; },
});

const makeAttemptRepo = () => ({
  rows: [],
  async create(data) {
    const row = { deploymentAttemptUid: crypto.randomUUID(), transactionHash: null, ...data };
    this.rows.push(row);
    return { ...row };
  },
  async update(uid, data) {
    const row = this.rows.find((item) => item.deploymentAttemptUid === uid);
    Object.assign(row, data);
    return { ...row };
  },
  async findByUid(uid) {
    const row = this.rows.find((item) => item.deploymentAttemptUid === uid);
    return row ? { ...row } : null;
  },
  async findActiveByToken(tokenUid) {
    const active = ['pending', 'submitted', 'confirming'];
    const found = [...this.rows].reverse().find((r) => r.tokenUid === tokenUid && active.includes(r.status));
    return found ? { ...found } : null;
  },
  async findByIdempotencyKey(tokenUid, key) {
    const found = [...this.rows].reverse().find((r) => r.tokenUid === tokenUid && r.idempotencyKey === key);
    return found ? { ...found } : null;
  },
  async findByTransactionHash(hash) {
    const found = this.rows.find((r) => r.transactionHash === hash);
    return found ? { ...found } : null;
  },
  async findByTokenAndHash(tokenUid, hash) {
    const found = this.rows.find((r) => r.tokenUid === tokenUid && r.transactionHash === hash);
    return found ? { ...found } : null;
  },
  async findLatestByToken(tokenUid) {
    const found = [...this.rows].reverse().find((r) => r.tokenUid === tokenUid);
    return found ? { ...found } : null;
  },
  async expireStalePending(tokenUid) {
    let count = 0;
    for (const row of this.rows) {
      if (row.tokenUid === tokenUid && row.status === 'pending' && row.expiresAt
        && new Date(row.expiresAt).getTime() < Date.now()) {
        row.status = 'expired';
        count += 1;
      }
    }
    return count;
  },
});

const tokenServiceStub = {
  async approvedOrganization() { return organization; },
  async assertTokenReadyForDeployment() { return { claimTopics: [{}], countryRestrictions: [{}] }; },
};

const makeService = (token, overrides = {}) => new TokenDeploymentAttemptService({
  attemptRepository: overrides.attemptRepository || makeAttemptRepo(),
  tokenRepository: overrides.tokenRepository || makeTokenRepo(token),
  organizationRepository: { findByUserUid: async () => organization },
  tokenService: overrides.tokenService || tokenServiceStub,
  config: { supportedChainIds: [CHAIN_ID], networkName: 'sepolia', deploymentAttemptTtlMinutes: 20 },
  transactionRunner: runner,
});

const baseInput = { chainId: CHAIN_ID, walletAddress: ORG_WALLET, idempotencyKey: 'client-key-0001' };

test('authorized issuer creates a pending attempt and moves the token to deploymentPending', async () => {
  const tokenRepository = makeTokenRepo({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'draft' });
  const service = makeService(null, { tokenRepository });
  const result = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  assert.equal(result.created, true);
  assert.equal(result.attempt.status, 'pending');
  assert.equal(result.attempt.walletAddress, ORG_WALLET.toLowerCase());
  assert.equal(tokenRepository.token.status, 'deploymentPending');
});

test('unsupported chain is rejected', async () => {
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'draft' });
  await assert.rejects(
    service.createDeploymentAttempt({ user: issuer, ...baseInput, chainId: 1 }),
    (error) => error.code === 'UNSUPPORTED_CHAIN' && error.statusCode === 400,
  );
});

test('a deployer wallet that is not the organization wallet is rejected', async () => {
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'draft' });
  await assert.rejects(
    service.createDeploymentAttempt({ user: issuer, ...baseInput, walletAddress: OTHER_WALLET }),
    (error) => error.code === 'INVALID_DEPLOYER_WALLET' && error.statusCode === 403,
  );
});

test('incomplete token configuration surfaces a 422 not-ready error', async () => {
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'draft' }, {
    tokenService: {
      approvedOrganization: async () => organization,
      assertTokenReadyForDeployment: async () => {
        const { ApiError } = require('../../src/core/errors/api-error');
        throw ApiError.badRequest('Token form is incomplete.');
      },
    },
  });
  await assert.rejects(
    service.createDeploymentAttempt({ user: issuer, ...baseInput }),
    (error) => error.code === 'TOKEN_NOT_READY_FOR_DEPLOYMENT' && error.statusCode === 422,
  );
});

test('an already-deployed token cannot start a new attempt', async () => {
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deployed', deployTxHash: TX_HASH });
  await assert.rejects(
    service.createDeploymentAttempt({ user: issuer, ...baseInput }),
    (error) => error.code === 'TOKEN_ALREADY_DEPLOYED' && error.statusCode === 409,
  );
});

test('the same idempotency key returns the same attempt instead of creating a duplicate', async () => {
  const attemptRepository = makeAttemptRepo();
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'draft' }, { attemptRepository });
  const first = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  const second = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  assert.equal(second.created, false);
  assert.equal(second.attempt.deploymentAttemptUid, first.attempt.deploymentAttemptUid);
  assert.equal(attemptRepository.rows.length, 1);
});

test('a submitted attempt blocks a second attempt with a new idempotency key', async () => {
  const attemptRepository = makeAttemptRepo();
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deploymentPending' }, { attemptRepository });
  const created = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  await attemptRepository.update(created.attempt.deploymentAttemptUid, { status: 'submitted', transactionHash: TX_HASH });
  await assert.rejects(
    service.createDeploymentAttempt({ user: issuer, ...baseInput, idempotencyKey: 'client-key-0002' }),
    (error) => error.code === 'DEPLOYMENT_ALREADY_IN_PROGRESS' && error.statusCode === 409,
  );
});

test('an expired pending attempt allows a brand new attempt', async () => {
  const attemptRepository = makeAttemptRepo();
  attemptRepository.rows.push({
    deploymentAttemptUid: crypto.randomUUID(),
    tokenUid: 'token-1',
    userUid: 'user-1',
    status: 'pending',
    idempotencyKey: 'stale-key',
    walletAddress: ORG_WALLET.toLowerCase(),
    expiresAt: new Date(Date.now() - 60000),
    transactionHash: null,
  });
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deploymentPending' }, { attemptRepository });
  const result = await service.createDeploymentAttempt({ user: issuer, ...baseInput, idempotencyKey: 'fresh-key' });
  assert.equal(result.created, true);
  assert.equal(attemptRepository.rows.find((r) => r.idempotencyKey === 'stale-key').status, 'expired');
});

test('recording a broadcast transaction hash is idempotent and rejects a different hash', async () => {
  const attemptRepository = makeAttemptRepo();
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deploymentPending' }, { attemptRepository });
  const created = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  const submitInput = {
    user: issuer,
    deploymentAttemptUid: created.attempt.deploymentAttemptUid,
    transactionHash: TX_HASH,
    walletAddress: ORG_WALLET,
    chainId: CHAIN_ID,
  };
  const submitted = await service.markDeploymentSubmitted(submitInput);
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.transactionHash, TX_HASH);

  const again = await service.markDeploymentSubmitted(submitInput);
  assert.equal(again.transactionHash, TX_HASH);

  await assert.rejects(
    service.markDeploymentSubmitted({ ...submitInput, transactionHash: TX_HASH_2 }),
    (error) => error.code === 'TRANSACTION_HASH_CONFLICT' && error.statusCode === 409,
  );
});

test('wallet rejection closes a pending attempt but cannot close a broadcast attempt', async () => {
  const attemptRepository = makeAttemptRepo();
  const tokenRepository = makeTokenRepo({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deploymentPending' });
  const service = makeService(null, { attemptRepository, tokenRepository });
  const created = await service.createDeploymentAttempt({ user: issuer, ...baseInput });

  const closed = await service.markDeploymentAttemptFailed({
    user: issuer,
    deploymentAttemptUid: created.attempt.deploymentAttemptUid,
    status: 'wallet_rejected',
    errorCode: 'USER_REJECTED_REQUEST',
    errorMessage: 'The wallet request was rejected.',
  });
  assert.equal(closed.status, 'wallet_rejected');
  assert.equal(tokenRepository.token.status, 'draft');

  // A broadcast attempt cannot be closed by the frontend.
  const created2 = await service.createDeploymentAttempt({ user: issuer, ...baseInput, idempotencyKey: 'key-two' });
  await attemptRepository.update(created2.attempt.deploymentAttemptUid, { status: 'submitted', transactionHash: TX_HASH });
  await assert.rejects(
    service.markDeploymentAttemptFailed({
      user: issuer, deploymentAttemptUid: created2.attempt.deploymentAttemptUid, status: 'wallet_rejected',
    }),
    (error) => error.code === 'TRANSACTION_ALREADY_BROADCAST' && error.statusCode === 409,
  );
});

test('a user cannot mark another user\'s attempt submitted', async () => {
  const attemptRepository = makeAttemptRepo();
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deploymentPending' }, { attemptRepository });
  const created = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  await assert.rejects(
    service.markDeploymentSubmitted({
      user: { userUid: 'intruder', roleName: 'Issuer' },
      deploymentAttemptUid: created.attempt.deploymentAttemptUid,
      transactionHash: TX_HASH,
      walletAddress: ORG_WALLET,
      chainId: CHAIN_ID,
    }),
    (error) => error.statusCode === 403 || error.statusCode === 404,
  );
});

test('the active endpoint reports resume state after a browser refresh', async () => {
  const attemptRepository = makeAttemptRepo();
  const service = makeService({ tokenUid: 'token-1', organizationUid: 'org-1', status: 'deploymentPending' }, { attemptRepository });
  const created = await service.createDeploymentAttempt({ user: issuer, ...baseInput });
  await attemptRepository.update(created.attempt.deploymentAttemptUid, { status: 'submitted', transactionHash: TX_HASH });

  const state = await service.getActiveDeploymentAttempt({ user: issuer });
  assert.equal(state.canCreateNew, false);
  assert.equal(state.attempt.status, 'submitted');
  assert.equal(state.attempt.transactionHash, TX_HASH);
  assert.equal(state.tokenDeployed, false);
});

// ---- Extended final-submit behavior (attempt linking, atomic finalize, 202) ----

const deployedTokenTemplate = () => ({
  tokenUid: 'token-1',
  organizationUid: 'org-1',
  status: 'deploymentPending',
  tokenName: 'Acme Security Token',
  tokenSymbol: 'ACME',
  decimals: 18,
  initialTokenPrice: 1,
  treasuryWalletAddress: ORG_WALLET,
  imageStorageKey: 'token.webp',
  trustedClaimIssuerWalletAddress: ORG_WALLET,
  maxInvestors: 2000,
  maxBalancePerInvestor: 10000,
  countryRestrictionMode: 'allowlist',
  tokenAgentWalletAddress: ORG_WALLET,
  identityManagerWalletAddress: ORG_WALLET,
});

const verifiedDeployment = {
  platformAgentWallet: ORG_WALLET,
  tokenAddress: '0x3333333333333333333333333333333333333333',
  identityRegistryAddress: '0x4444444444444444444444444444444444444444',
  identityRegistryStorageAddress: '0x5555555555555555555555555555555555555555',
  trustedIssuersRegistryAddress: '0x6666666666666666666666666666666666666666',
  claimTopicsRegistryAddress: '0x7777777777777777777777777777777777777777',
  modularComplianceAddress: '0x8888888888888888888888888888888888888888',
  deployTxHash: TX_HASH,
  deployedAtBlock: 9000000,
  deployedAt: new Date('2026-08-04T00:00:00.000Z'),
};

test('final submit with a deployment attempt finalizes both token and attempt atomically', async () => {
  const token = deployedTokenTemplate();
  let tokenUpdate;
  const attemptRow = {
    deploymentAttemptUid: 'attempt-1',
    tokenUid: 'token-1',
    organizationUid: 'org-1',
    userUid: 'user-1',
    walletAddress: ORG_WALLET.toLowerCase(),
    status: 'submitted',
    transactionHash: TX_HASH,
  };
  let attemptUpdate;
  const service = new TokenService({
    repository: {
      findByUserUid: async () => token,
      findForUpdateByUserUid: async () => token,
      listClaimTopics: async () => [{ claimTopicUid: 'c1', value: 1 }],
      listCountryRestrictions: async () => [{ countryUid: 'co1', iso3166NumericCode: '840' }],
      findByDeployTxHashExcept: async () => null,
      findByTokenAddressExcept: async () => null,
      updateDeploymentByUserUid: async (userUid, fields) => { tokenUpdate = fields; return { ...token, ...fields }; },
    },
    organizationRepository: { findByUserUid: async () => organization },
    imageService: { resolve: () => __filename },
    deploymentReceiptService: {
      checkConfirmation: async () => ({ ready: true }),
      verify: async () => verifiedDeployment,
    },
    attemptRepository: {
      findByUid: async () => ({ ...attemptRow }),
      update: async (uid, fields) => { attemptUpdate = { uid, fields }; return { ...attemptRow, ...fields }; },
    },
    transactionRunner: runner,
  });

  const result = await service.submit(issuer, { transactionHash: TX_HASH, deploymentAttemptUid: 'attempt-1' });
  assert.equal(result.status, 'deployed');
  assert.equal(tokenUpdate.status, 'deployed');
  assert.equal(tokenUpdate.contractAddress, verifiedDeployment.tokenAddress);
  assert.equal(attemptUpdate.fields.status, 'confirmed');
  assert.equal(attemptUpdate.fields.contractAddress, verifiedDeployment.tokenAddress);
  assert.equal(attemptUpdate.fields.blockNumber, 9000000);
});

test('final submit returns a 202/confirming marker while the receipt is not yet available', async () => {
  const token = deployedTokenTemplate();
  const attemptRow = {
    deploymentAttemptUid: 'attempt-1', tokenUid: 'token-1', organizationUid: 'org-1',
    userUid: 'user-1', walletAddress: ORG_WALLET.toLowerCase(), status: 'submitted', transactionHash: TX_HASH,
  };
  let attemptUpdate;
  const service = new TokenService({
    repository: {
      findByUserUid: async () => token,
      listClaimTopics: async () => [{ claimTopicUid: 'c1', value: 1 }],
      listCountryRestrictions: async () => [{ countryUid: 'co1', iso3166NumericCode: '840' }],
      findByDeployTxHashExcept: async () => null,
      updateDeploymentByUserUid: async () => { throw new Error('should not finalize while pending'); },
    },
    organizationRepository: { findByUserUid: async () => organization },
    imageService: { resolve: () => __filename },
    deploymentReceiptService: {
      checkConfirmation: async () => ({ ready: false }),
      verify: async () => { throw new Error('should not be called'); },
    },
    attemptRepository: {
      findByUid: async () => ({ ...attemptRow }),
      update: async (uid, fields) => { attemptUpdate = fields; return { ...attemptRow, ...fields }; },
    },
    transactionRunner: runner,
  });

  const result = await service.submit(issuer, { transactionHash: TX_HASH, deploymentAttemptUid: 'attempt-1' });
  assert.equal(result.pending, true);
  assert.equal(result.status, 'confirming');
  assert.equal(attemptUpdate.status, 'confirming');
});

test('final submit is idempotent once the token is already deployed with the same hash', async () => {
  const token = { ...deployedTokenTemplate(), status: 'deployed', deployTxHash: TX_HASH };
  const service = new TokenService({
    repository: { findByUserUid: async () => token },
    organizationRepository: { findByUserUid: async () => organization },
    imageService: { resolve: () => __filename },
    deploymentReceiptService: { verify: async () => { throw new Error('should not re-verify'); } },
    transactionRunner: runner,
  });
  const result = await service.submit(issuer, { transactionHash: TX_HASH });
  assert.equal(result.status, 'deployed');
});

// ---- /fail reconcile-before-revert (recover a lost deployment instead of reverting) ----

const FACTORY_ADDR = '0xe221247C52ece62027eb7D01D0f522d7363Fe875';
const DEPLOYED_TOKEN_ADDR = '0x3333333333333333333333333333333333333333';

const makeFailSetup = ({ reconcileImpl, tokenStatus = 'deploymentPending' }) => {
  const token = {
    tokenUid: 'token-1', userUid: 'user-1', organizationUid: 'org-1',
    status: tokenStatus, organizationWalletAddress: ORG_WALLET, tokenName: 'My Token', tokenSymbol: 'MTK',
  };
  const tokenRepo = {
    token,
    async findForUpdateByUserUid() { return this.token; },
    async findByUserUid() { return this.token; },
    async updateByUserUid(u, f) { Object.assign(this.token, f); return { ...this.token }; },
    async updateDeploymentByUserUid(u, f) { Object.assign(this.token, f); return { ...this.token }; },
    async findByTokenAddressExcept() { return null; },
    async findByDeployTxHashExcept() { return null; },
  };
  const attemptRepo = {
    row: {
      deploymentAttemptUid: 'attempt-1', tokenUid: 'token-1', organizationUid: 'org-1',
      userUid: 'user-1', walletAddress: ORG_WALLET.toLowerCase(), status: 'pending', transactionHash: null,
    },
    async findByUid() { return { ...this.row }; },
    async update(uid, fields) { Object.assign(this.row, fields); return { ...this.row }; },
  };
  const service = new TokenDeploymentAttemptService({
    attemptRepository: attemptRepo,
    tokenRepository: tokenRepo,
    organizationRepository: { findByUserUid: async () => organization },
    tokenService: tokenServiceStub,
    deploymentReceiptService: { reconcileBySalt: reconcileImpl },
    config: {
      supportedChainIds: [CHAIN_ID], sepoliaRpcUrl: 'https://sepolia.example.test',
      trexFactoryAddress: FACTORY_ADDR, trexFactoryStartBlock: 0, networkName: 'sepolia', deploymentAttemptTtlMinutes: 20,
    },
    transactionRunner: runner,
  });
  return { service, tokenRepo, attemptRepo };
};

test('fail reconcile: when the token is deployed on-chain, finalize it and reject the fail', async () => {
  const { service, tokenRepo, attemptRepo } = makeFailSetup({
    reconcileImpl: async () => ({
      deployed: true,
      tokenAddress: DEPLOYED_TOKEN_ADDR,
      saltHash: `0x${'a'.repeat(64)}`,
      rawSalt: 'raw',
      transactionHash: TX_HASH,
      deployment: {
        platformAgentWallet: ORG_WALLET,
        identityRegistryAddress: '0x4444444444444444444444444444444444444444',
        deployedAtBlock: 100,
        deployedAt: new Date('2026-08-04T00:00:00.000Z'),
      },
    }),
  });
  await assert.rejects(
    service.markDeploymentAttemptFailed({ user: issuer, deploymentAttemptUid: 'attempt-1', status: 'wallet_rejected' }),
    (error) => error.code === 'TOKEN_ALREADY_DEPLOYED' && error.statusCode === 409,
  );
  assert.equal(tokenRepo.token.status, 'deployed');
  assert.equal(tokenRepo.token.tokenAddress, DEPLOYED_TOKEN_ADDR);
  assert.equal(attemptRepo.row.status, 'confirmed');
});

test('fail reconcile: when nothing is deployed on-chain, revert the token to draft', async () => {
  const { service, tokenRepo, attemptRepo } = makeFailSetup({
    reconcileImpl: async () => ({ deployed: false, saltHash: `0x${'b'.repeat(64)}`, rawSalt: 'raw', tokenAddress: null, transactionHash: null, deployment: null }),
  });
  const updated = await service.markDeploymentAttemptFailed({ user: issuer, deploymentAttemptUid: 'attempt-1', status: 'wallet_rejected' });
  assert.equal(updated.status, 'wallet_rejected');
  assert.equal(tokenRepo.token.status, 'draft');
  assert.equal(attemptRepo.row.status, 'wallet_rejected');
});

test('fail reconcile: when the chain cannot be reached, keep the token in deploymentPending', async () => {
  const { service, tokenRepo, attemptRepo } = makeFailSetup({
    reconcileImpl: async () => { throw new Error('RPC unavailable'); },
  });
  const updated = await service.markDeploymentAttemptFailed({ user: issuer, deploymentAttemptUid: 'attempt-1', status: 'wallet_rejected' });
  assert.equal(updated.status, 'wallet_rejected');
  assert.equal(tokenRepo.token.status, 'deploymentPending');
  assert.equal(attemptRepo.row.status, 'wallet_rejected');
});
