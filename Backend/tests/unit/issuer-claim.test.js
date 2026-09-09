const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const schemas = require('../../src/schemas/issuer-claim.schema');
const { IssuerClaimService } = require('../../src/services/issuer-claim.service');
const { ClaimSignatureService, buildClaimDigest } = require('../../src/services/blockchain/claim-signature.service');

const issuer = { userUid: 'u-iss', roleName: 'Issuer' };
const IDENTITY = `0x${'ab'.repeat(20)}`;
const DATA = '0x4b59435f415050524f564544'; // "KYC_APPROVED"

const sign = (wallet, identity, topic, data) => wallet.signMessage(ethers.getBytes(buildClaimDigest(identity, topic, data)));

const makeService = (over = {}) => {
  const issuerWallet = over.wallet || ethers.Wallet.createRandom();
  const state = {
    wallet: issuerWallet,
    interest: over.interest || {
      interestUid: 'int-1', organizationUid: 'org-1', investorUid: 'inv-1', tokenUid: 'tok-1',
      status: over.status || 'submitIntrest', investorIdentityAddress: over.identity || IDENTITY,
    },
    interestUpdate: null,
    history: [],
    org: over.org || { organizationUid: 'org-1', walletAddress: issuerWallet.address },
    requiredTopics: over.requiredTopics || [{ value: 1 }, { value: 2 }],
    verifications: [],
    sigs: {},
  };
  const repository = {
    getMaxAttempt: async (interestUid) => state.verifications.filter((v) => v.interestUid === interestUid).reduce((m, v) => Math.max(m, v.attemptNumber), 0),
    createVerification: async (data) => { const v = { verificationUid: `v${state.verifications.length + 1}`, ...data }; state.verifications.push(v); state.sigs[v.verificationUid] = []; return v; },
    findVerificationByUid: async (uid) => state.verifications.find((v) => v.verificationUid === uid) || null,
    findLatestVerification: async (interestUid) => state.verifications.filter((v) => v.interestUid === interestUid).sort((a, b) => b.attemptNumber - a.attemptNumber)[0] || null,
    findLatestVerificationByStatus: async (interestUid, status) => state.verifications.filter((v) => v.interestUid === interestUid && v.status === status).sort((a, b) => b.attemptNumber - a.attemptNumber)[0] || null,
    updateVerification: async (uid, data) => { const v = state.verifications.find((x) => x.verificationUid === uid); Object.assign(v, data); return v; },
    upsertSignature: async (data) => {
      const list = state.sigs[data.verificationUid];
      const existing = list.find((s) => s.claimTopic === data.claimTopic);
      if (existing) Object.assign(existing, data); else list.push({ ...data });
    },
    listSignatures: async (uid) => [...(state.sigs[uid] || [])].sort((a, b) => a.claimTopic - b.claimTopic),
  };
  const service = new IssuerClaimService({
    repository,
    interestRepository: {
      findInterestByUid: async () => state.interest,
      updateInterestByUid: async (uid, data) => {
        state.interestUpdate = { uid, ...data };
        if (state.interest && state.interest.interestUid === uid) state.interest.status = data.status;
        return state.interest;
      },
      createHistory: async (data) => { state.history.push(data); return `h${state.history.length}`; },
    },
    organizationRepository: { findByUserUid: async () => state.org },
    tokenRepository: { listClaimTopics: async () => state.requiredTopics },
    claimSignatureService: new ClaimSignatureService(),
  });
  return { service, state };
};

// ----------------------------------------------------------------- crypto

test('claim signature verifies against the registered issuer wallet and rejects others', async () => {
  const svc = new ClaimSignatureService();
  const wallet = ethers.Wallet.createRandom();
  const signature = await sign(wallet, IDENTITY, 1, DATA);
  const ok = svc.verifyClaimSignature({ investorIdentityAddress: IDENTITY, expectedIssuerWallet: wallet.address, claimTopic: 1, data: DATA, signature });
  assert.equal(ok.valid, true);
  assert.equal(ok.signedByWallet.toLowerCase(), wallet.address.toLowerCase());

  const other = ethers.Wallet.createRandom();
  const bad = svc.verifyClaimSignature({ investorIdentityAddress: IDENTITY, expectedIssuerWallet: other.address, claimTopic: 1, data: DATA, signature });
  assert.equal(bad.valid, false);
});

// ----------------------------------------------------------------- schema

test('signClaims schema enforces the frontend contract', () => {
  const good = schemas.signClaims.validate({ subscriptionId: '00000000-0000-4000-8000-000000000001', claims: [{ claimTopic: 1, data: DATA, signature: `0x${'a'.repeat(130)}` }] });
  assert.equal(good.error, undefined);
  // Rejects backend-controlled fields and bad formats.
  assert.ok(schemas.signClaims.validate({ subscriptionId: 'x', claims: [] }).error);
  assert.ok(schemas.signClaims.validate({ subscriptionId: '00000000-0000-4000-8000-000000000001', claims: [{ claimTopic: 1, data: DATA, signature: '0x1234', status: 'SIGNED' }] }).error);
});

// --------------------------------------------------------------- flow

test('all required claims valid -> overall SIGNED', async () => {
  const { service, state } = makeService();
  const claims = [
    { claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) },
    { claimTopic: 2, data: DATA, signature: await sign(state.wallet, IDENTITY, 2, DATA) },
  ];
  const result = await service.signClaims(issuer, { subscriptionId: 'int-1', claims });
  assert.equal(result.status, 'SIGNED');
  assert.equal(result.requiredClaimCount, 2);
  assert.equal(result.verifiedClaimCount, 2);
  assert.ok(result.completedAt);
  assert.deepEqual(result.claims.map((c) => c.status), ['SIGNED', 'SIGNED']);
  assert.equal(result.claims[0].signedByWallet.toLowerCase(), state.wallet.address.toLowerCase());
  // A fully SIGNED verification advances the subscription to verifiedByIssuer...
  assert.equal(state.interestUpdate.status, 'verifiedByIssuer');
  // ...and records a verifiedByIssuer event on the interest timeline.
  assert.ok(state.history.some((h) => h.eventType === 'verifiedByIssuer' && h.actorRole === 'issuer'));
});

test('a failed verification records no verifiedByIssuer timeline event', async () => {
  const { service, state } = makeService();
  const other = ethers.Wallet.createRandom();
  await service.signClaims(issuer, {
    subscriptionId: 'int-1',
    claims: [
      { claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) },
      { claimTopic: 2, data: DATA, signature: await sign(other, IDENTITY, 2, DATA) },
    ],
  });
  assert.equal(state.history.length, 0);
});

test('one invalid signature -> overall VERIFICATION_FAILED (not SIGNED)', async () => {
  const { service, state } = makeService();
  const other = ethers.Wallet.createRandom();
  const claims = [
    { claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) },
    { claimTopic: 2, data: DATA, signature: await sign(other, IDENTITY, 2, DATA) }, // wrong signer
  ];
  const result = await service.signClaims(issuer, { subscriptionId: 'int-1', claims });
  assert.equal(result.status, 'VERIFICATION_FAILED');
  assert.equal(result.verifiedClaimCount, 1);
  const failed = result.claims.find((c) => c.claimTopic === 2);
  assert.equal(failed.status, 'VERIFICATION_FAILED');
  assert.match(failed.verificationError, /does not match/i);
  // A failed verification must NOT advance the subscription — it stays submitIntrest.
  assert.equal(state.interestUpdate, null);
  assert.equal(state.interest.status, 'submitIntrest');
});

test('partial submission (missing a required topic) -> overall PENDING', async () => {
  const { service, state } = makeService();
  const claims = [{ claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) }];
  const result = await service.signClaims(issuer, { subscriptionId: 'int-1', claims });
  assert.equal(result.status, 'PENDING');
  assert.equal(result.verifiedClaimCount, 1);
  assert.equal(result.requiredClaimCount, 2);
  assert.equal(state.interestUpdate, null, 'a partial verification does not advance the subscription');
});

test('a malformed signature is recorded as VERIFICATION_FAILED, not thrown', async () => {
  const { service, state } = makeService({ requiredTopics: [{ value: 1 }] });
  const claims = [{ claimTopic: 1, data: DATA, signature: `0x${'00'.repeat(65)}` }];
  const result = await service.signClaims(issuer, { subscriptionId: 'int-1', claims });
  assert.equal(result.status, 'VERIFICATION_FAILED');
  assert.equal(result.claims[0].status, 'VERIFICATION_FAILED');
});

test('rejects claim topics not required by the token', async () => {
  const { service, state } = makeService();
  const claims = [{ claimTopic: 3, data: DATA, signature: await sign(state.wallet, IDENTITY, 3, DATA) }];
  await assert.rejects(service.signClaims(issuer, { subscriptionId: 'int-1', claims }), (e) => e.statusCode === 400);
});

test('rejects duplicate claim topics', async () => {
  const { service, state } = makeService();
  const sig = await sign(state.wallet, IDENTITY, 1, DATA);
  const claims = [{ claimTopic: 1, data: DATA, signature: sig }, { claimTopic: 1, data: DATA, signature: sig }];
  await assert.rejects(service.signClaims(issuer, { subscriptionId: 'int-1', claims }), (e) => e.statusCode === 400);
});

test('rejects signing when the subscription is not in an allowed state', async () => {
  const { service, state } = makeService({ status: 'pending' });
  const claims = [{ claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) }];
  await assert.rejects(service.signClaims(issuer, { subscriptionId: 'int-1', claims }), (e) => e.statusCode === 409);
});

test('rejects a subscription that does not belong to the issuer organization', async () => {
  const { service, state } = makeService({ interest: { interestUid: 'int-1', organizationUid: 'org-OTHER', investorUid: 'inv-1', tokenUid: 'tok-1', status: 'verifiedByIssuer', investorIdentityAddress: IDENTITY } });
  const claims = [{ claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) }];
  await assert.rejects(service.signClaims(issuer, { subscriptionId: 'int-1', claims }), (e) => e.statusCode === 404);
});

test('only issuers may sign claims', async () => {
  const { service } = makeService();
  await assert.rejects(service.signClaims({ userUid: 'u', roleName: 'Investor' }, { subscriptionId: 'int-1', claims: [{ claimTopic: 1, data: DATA, signature: `0x${'a'.repeat(130)}` }] }), /only to issuer/i);
});

test('retry creates a new attempt; a completed SIGNED verification is returned idempotently', async () => {
  const { service, state } = makeService();
  const other = ethers.Wallet.createRandom();
  // Attempt 1: topic 2 signed by the wrong wallet -> FAILED overall.
  await service.signClaims(issuer, {
    subscriptionId: 'int-1',
    claims: [
      { claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) },
      { claimTopic: 2, data: DATA, signature: await sign(other, IDENTITY, 2, DATA) },
    ],
  });
  // Attempt 2: both correct -> SIGNED, attemptNumber increments.
  const second = await service.signClaims(issuer, {
    subscriptionId: 'int-1',
    claims: [
      { claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) },
      { claimTopic: 2, data: DATA, signature: await sign(state.wallet, IDENTITY, 2, DATA) },
    ],
  });
  assert.equal(second.status, 'SIGNED');
  assert.equal(second.attemptNumber, 2);
  assert.equal(state.verifications.length, 2, 'previous attempt is preserved');

  // Third submit after completion returns the SIGNED verification without a new attempt.
  const third = await service.signClaims(issuer, {
    subscriptionId: 'int-1',
    claims: [{ claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) }],
  });
  assert.equal(third.status, 'SIGNED');
  assert.equal(third.verificationId, second.verificationId);
  assert.equal(state.verifications.length, 2, 'no new attempt after SIGNED');
});

test('status endpoint returns the latest attempt (or an empty PENDING before any submission)', async () => {
  const { service, state } = makeService();
  const empty = await service.getStatus(issuer, 'int-1');
  assert.equal(empty.status, 'PENDING');
  assert.equal(empty.verificationId, null);
  assert.equal(empty.requiredClaimCount, 2);

  await service.signClaims(issuer, { subscriptionId: 'int-1', claims: [{ claimTopic: 1, data: DATA, signature: await sign(state.wallet, IDENTITY, 1, DATA) }] });
  const latest = await service.getStatus(issuer, 'int-1');
  assert.equal(latest.status, 'PENDING');
  assert.equal(latest.attemptNumber, 1);
  assert.equal(latest.claims.length, 1);
});
