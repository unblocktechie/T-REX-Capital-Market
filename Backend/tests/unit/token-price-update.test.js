const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const schemas = require('../../src/schemas/token.schema');
const { TokenPriceUpdateService } = require('../../src/services/token-price-update.service');
const { TokenPriceIndexerService } = require('../../src/services/blockchain/token-price-indexer.service');
const { CONTROLLER_ABI } = require('../../src/services/blockchain/blockchain-transaction.service');

const CHAIN_UID = '60000000-0000-4000-8000-000000000001';
const CONTROLLER = ethers.getAddress('0x1111111111111111111111111111111111111111');
const TOKEN = ethers.getAddress('0x2222222222222222222222222222222222222222');
const ISSUER = ethers.getAddress('0x3333333333333333333333333333333333333333');
const TX_HASH = `0x${'a'.repeat(64)}`;

test('relayed price schemas preserve raw contract units and validate EIP-712 signature parts', () => {
  assert.equal(schemas.tokenPriceRelayPrepare.validate({ price: '1.5' }).error, undefined);
  assert.equal(schemas.tokenPriceRelaySubmit.validate({
    tokenAddress: TOKEN,
    newPriceRaw: '1500000',
    nonce: '7',
    deadline: Math.floor(Date.now() / 1000) + 600,
    v: 27,
    r: `0x${'1'.repeat(64)}`,
    s: `0x${'2'.repeat(64)}`,
  }).error, undefined);
  assert.ok(schemas.tokenPriceRelaySubmit.validate({
    tokenAddress: TOKEN, newPriceRaw: '0', nonce: '7', deadline: 1, v: 27,
    r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}`,
  }).error);
});

test('prepare returns controller-domain typed data and submit relays only the registered service-wallet signature', async () => {
  const serviceWallet = ethers.Wallet.createRandom();
  const state = { row: null, submitted: null, cachedWallet: null };
  const setPriceOnBehalfOf = async () => ({ hash: TX_HASH });
  setPriceOnBehalfOf.staticCall = async () => true;
  const controller = {
    getTokenInfo: async () => ({ issuer: ISSUER }),
    serviceWalletOf: async (address) => { assert.equal(address, TOKEN); return serviceWallet.address; },
    PRICE_DECIMALS: async () => 6,
    eip712Domain: async () => ({
      name: 'TREXPlatformController', version: '1', chainId: 11155111n,
      verifyingContract: CONTROLLER,
    }),
    nonces: async () => 7n,
    tokenPrice: async () => 1_000_000n,
    setPriceOnBehalfOf,
  };
  const repository = {
    findBySignerNonce: async () => state.row,
    countRecent: async () => 0,
    createPending: async (data) => {
      state.row = {
        priceUpdateUid: '70000000-0000-4000-8000-000000000001', status: 'PENDING',
        signatureR: data.signatureR, signatureS: data.signatureS,
        signatureDeadline: data.signatureDeadline, tokenAddress: data.tokenAddress,
        newPriceRaw: data.newPriceRaw, ...data,
      };
      return state.row;
    },
    markSubmitted: async (uid, transactionHash) => {
      state.submitted = { uid, transactionHash };
      state.row = { ...state.row, status: 'SUBMITTED', transactionHash };
      return state.row;
    },
    markFailed: async () => {},
    findByUid: async () => state.row,
  };
  const organizationRepository = {
    findByUserUid: async () => ({
      organizationUid: 'organization-1', userUid: 'issuer-user-1', status: 'approved', walletAddress: ISSUER,
    }),
    upsertServiceWallet: async (data) => { state.cachedWallet = data; return data; },
    updateByUserUid: async () => {},
  };
  const service = new TokenPriceUpdateService({
    tokenRepository: {
      findByUserUid: async () => ({
        tokenUid: 'token-1', organizationUid: 'organization-1', chainUid: CHAIN_UID,
        status: 'deployed', tokenAddress: TOKEN,
      }),
    },
    organizationRepository,
    repository,
    chainRuntimeService: { requireSigner: () => true },
    settingRepository: { findByKey: async () => null },
    transactionRunner: (work) => work({}),
    dependencies: {
      providerFactory: () => ({ getNetwork: async () => ({ chainId: 11155111n }), destroy() {} }),
      walletFactory: () => ({ address: ethers.getAddress('0x4444444444444444444444444444444444444444') }),
      contractFactory: () => controller,
    },
  });
  const user = { userUid: 'issuer-user-1', roleName: 'Issuer' };
  const chain = {
    chainUid: CHAIN_UID, chainId: 11155111, rpcUrl: 'rpc', platformControllerAddress: CONTROLLER,
    deployerPrivateKey: `0x${'1'.repeat(64)}`,
  };
  const prepared = await service.prepare(user, { price: '1.5' }, chain);
  assert.equal(prepared.newPriceRaw, '1500000');
  assert.equal(prepared.nonce, '7');
  assert.equal(prepared.serviceWalletAddress, serviceWallet.address);
  assert.equal(state.cachedWallet.chainUid, CHAIN_UID);

  const signed = ethers.Signature.from(await serviceWallet.signTypedData(
    prepared.typedData.domain, prepared.typedData.types, prepared.typedData.message,
  ));
  let checked = false; let released = false;
  service.policyService = {
    acquire: async tokenUid => { assert.equal(tokenUid, 'token-1'); return async () => { released = true; }; },
    check: async (uid, token, oldRaw, newRaw, decimals) => {
      assert.equal(state.row, null, 'policy must be checked before persisting or broadcasting');
      assert.equal(uid, 'key'); assert.equal(oldRaw, 1000000n); assert.equal(newRaw, 1500000n);
      assert.equal(decimals, 6); checked = true;
    },
  };
  const result = await service.submit(user, {
    tokenAddress: prepared.tokenAddress,
    newPriceRaw: prepared.newPriceRaw,
    nonce: prepared.nonce,
    deadline: prepared.deadline,
    v: signed.v,
    r: signed.r,
    s: signed.s,
  }, chain, { type: 'issuerApiKey', issuerApiKeyUid: 'key' });
  assert.equal(checked, true); assert.equal(released, true);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.transactionHash, TX_HASH);
  assert.deepEqual(state.submitted, { uid: result.priceUpdateUid, transactionHash: TX_HASH });
});

test('submit rejects a signature from any wallet other than the controller-registered service wallet', async () => {
  const registered = ethers.Wallet.createRandom();
  const attacker = ethers.Wallet.createRandom();
  const domain = { name: 'TREXPlatformController', version: '1', chainId: 11155111, verifyingContract: CONTROLLER };
  const message = { token: TOKEN, newPrice: '1500000', nonce: '0', deadline: Math.floor(Date.now() / 1000) + 600 };
  const types = { SetPrice: [
    { name: 'token', type: 'address' }, { name: 'newPrice', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ] };
  const signature = ethers.Signature.from(await attacker.signTypedData(domain, types, message));
  const controller = {
    getTokenInfo: async () => ({ issuer: ISSUER }), serviceWalletOf: async () => registered.address,
    PRICE_DECIMALS: async () => 6, eip712Domain: async () => domain, nonces: async () => 0n,
  };
  const service = new TokenPriceUpdateService({
    tokenRepository: { findByUserUid: async () => ({ tokenUid: 'token-1', organizationUid: 'org-1', chainUid: CHAIN_UID, status: 'deployed', tokenAddress: TOKEN }) },
    organizationRepository: { findByUserUid: async () => ({ organizationUid: 'org-1', userUid: 'user-1', status: 'approved', walletAddress: ISSUER }) },
    repository: {}, chainRuntimeService: {}, settingRepository: {},
    dependencies: {
      providerFactory: () => ({ getNetwork: async () => ({ chainId: 11155111n }), destroy() {} }),
      contractFactory: () => controller,
    },
  });
  await assert.rejects(service.submit({ userUid: 'user-1', roleName: 'Issuer' }, {
    tokenAddress: TOKEN, newPriceRaw: '1500000', nonce: '0', deadline: message.deadline,
    v: signature.v, r: signature.r, s: signature.s,
  }, { chainUid: CHAIN_UID, chainId: 11155111, rpcUrl: 'rpc', platformControllerAddress: CONTROLLER }),
  (error) => error.code === 'INVALID_PRICE_SIGNATURE');
});

test('price event recovery matches missed relayer hash from authoritative calldata and updates current price', async () => {
  const iface = new ethers.Interface(CONTROLLER_ABI);
  const event = iface.encodeEventLog(iface.getEvent('TokenPriceUpdated'), [TOKEN, 1_000_000n, 1_500_000n]);
  const r = `0x${'1'.repeat(64)}`;
  const s = `0x${'2'.repeat(64)}`;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const data = iface.encodeFunctionData('setPriceOnBehalfOf', [TOKEN, 1_500_000n, deadline, 27, r, s]);
  const log = {
    address: CONTROLLER, topics: event.topics, data: event.data, transactionHash: TX_HASH,
    blockNumber: 100, blockHash: `0x${'b'.repeat(64)}`, transactionIndex: 2, index: 5,
  };
  let confirmed;
  let currentPrice;
  const service = new TokenPriceIndexerService({
    settingRepository: {}, checkpointRepository: {},
    priceRepository: {
      findPendingByRelayCall: async (call) => {
        assert.equal(call.newPriceRaw, '1500000');
        assert.equal(call.signatureDeadline, deadline);
        return { priceUpdateUid: '70000000-0000-4000-8000-000000000001' };
      },
      confirmEvent: async (record) => { confirmed = record; currentPrice = record.newPriceFormatted; },
    },
    tokenRepository: {
      findDeployedByAddress: async () => ({
        tokenUid: 'token-1', organizationUid: 'org-1', issuerUserUid: 'issuer-user-1',
        tokenAddress: TOKEN, issuerWalletAddress: ISSUER, tokenAgentWalletAddress: CONTROLLER,
      }),
      updateCurrentPriceByTokenUid: async (_uid, value) => { currentPrice = value; },
    },
    organizationRepository: {},
    config: { chainUid: CHAIN_UID, chainId: 11155111 },
  });
  const parsed = iface.parseLog(log);
  const processed = await service.processPriceEvent({
    getTransactionReceipt: async () => ({ status: 1, index: 2, gasUsed: 100000n, gasPrice: 10n }),
    getTransaction: async () => ({ data, value: 0n, to: CONTROLLER, chainId: 11155111n }),
    getBlock: async () => ({ timestamp: 1791340000 }),
  }, log, parsed, CONTROLLER, 6, {});
  assert.equal(processed, true);
  assert.equal(confirmed.matchedPriceUpdateUid, '70000000-0000-4000-8000-000000000001');
  assert.equal(confirmed.transactionHash, TX_HASH);
  assert.equal(currentPrice, '1.5');
});

test('repeated submit returns the existing transaction after its signer nonce has been consumed', async () => {
  const wallet = ethers.Wallet.createRandom();
  const deadline = Math.floor(Date.now() / 1000) - 1;
  const domain = { name: 'TREXPlatformController', version: '1', chainId: 11155111, verifyingContract: CONTROLLER };
  const types = { SetPrice: [
    { name: 'token', type: 'address' }, { name: 'newPrice', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ] };
  const message = { token: TOKEN, newPrice: '1500000', nonce: '7', deadline };
  const signature = ethers.Signature.from(await wallet.signTypedData(domain, types, message));
  const existing = {
    priceUpdateUid: '70000000-0000-4000-8000-000000000002', status: 'SUBMITTED',
    tokenAddress: TOKEN, newPriceRaw: '1500000', signerNonce: '7', signatureDeadline: deadline,
    signatureR: signature.r, signatureS: signature.s, transactionHash: TX_HASH,
  };
  const service = new TokenPriceUpdateService({
    tokenRepository: { findByUserUid: async () => ({ tokenUid: 'token-1', organizationUid: 'org-1', chainUid: CHAIN_UID, status: 'deployed', tokenAddress: TOKEN }) },
    organizationRepository: { findByUserUid: async () => ({ organizationUid: 'org-1', userUid: 'user-1', status: 'approved', walletAddress: ISSUER }) },
    repository: {
      findBySignerNonce: async () => existing,
      findByUid: async () => existing,
    },
    chainRuntimeService: {}, settingRepository: {},
    dependencies: {
      providerFactory: () => ({ getNetwork: async () => ({ chainId: 11155111n }), destroy() {} }),
      contractFactory: () => ({
        getTokenInfo: async () => ({ issuer: ISSUER }), serviceWalletOf: async () => wallet.address,
        PRICE_DECIMALS: async () => 6, eip712Domain: async () => domain, nonces: async () => 8n,
      }),
    },
  });
  const result = await service.submit({ userUid: 'user-1', roleName: 'Issuer' }, {
    tokenAddress: TOKEN, newPriceRaw: '1500000', nonce: '7', deadline,
    v: signature.v, r: signature.r, s: signature.s,
  }, { chainUid: CHAIN_UID, chainId: 11155111, rpcUrl: 'rpc', platformControllerAddress: CONTROLLER });
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.transactionHash, TX_HASH);
});
