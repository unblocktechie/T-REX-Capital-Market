const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AuthService } = require('../../src/services/auth.service');
const { env } = require('../../src/core/config/env');

const createService = (user) => new AuthService({
  userRepository: { findByEmail: async () => user },
  roleRepository: {},
  authTokenRepository: {},
  emailService: {},
});

test('forgot password rejects an unregistered email with signup guidance', async () => {
  await assert.rejects(
    createService(null).forgotPassword('missing@example.com'),
    (error) => error.statusCode === 404
      && error.code === 'NOT_FOUND'
      && error.message === 'This email is not registered. Please sign up first.',
  );
});

test('forgot password rejects an inactive registered account', async () => {
  await assert.rejects(
    createService({ userUid: 'user-1', isActive: false }).forgotPassword('inactive@example.com'),
    (error) => error.statusCode === 403 && error.code === 'FORBIDDEN',
  );
});

test('resend verification reports an already-verified user without sending another email', async () => {
  let emailSent = false;
  const service = new AuthService({
    userRepository: { findByEmail: async () => ({ userUid: 'user-1', emailVerified: true, isActive: true }) },
    roleRepository: {}, authTokenRepository: {},
    emailService: { sendEmail: async () => { emailSent = true; } },
  });
  const result = await service.resendVerification('verified@example.com');
  assert.deepEqual(result, { status: 'ALREADY_VERIFIED', emailVerified: true });
  assert.equal(emailSent, false);
});

test('resend verification keeps unknown and inactive accounts on the generic response state', async () => {
  const unknown = createService(null);
  assert.deepEqual(await unknown.resendVerification('missing@example.com'), { status: 'REQUEST_ACCEPTED' });

  const inactive = createService({ userUid: 'user-1', emailVerified: false, isActive: false });
  assert.deepEqual(await inactive.resendVerification('inactive@example.com'), { status: 'REQUEST_ACCEPTED' });
});

const verifiedIdentity = {
  userUid: 'user-1',
  roleUid: 'role-investor',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  roleName: 'Investor',
  emailVerified: false,
  isActive: true,
  roleActive: true,
};

const createVerificationService = ({ identity = verifiedIdentity, tokenRecord = { tokenUid: 'token-1', userUid: 'user-1' } } = {}) => {
  const state = { verified: false, used: false, lastLogin: false };
  const executor = { name: 'test-transaction' };
  const service = new AuthService({
    userRepository: {
      findByUid: async () => ({ userUid: 'user-1' }),
      findAuthIdentityByUid: async () => identity,
      markEmailVerified: async () => { state.verified = true; },
      updateLastLogin: async (userUid, receivedExecutor) => {
        assert.equal(userUid, 'user-1');
        assert.equal(receivedExecutor, executor);
        state.lastLogin = true;
      },
    },
    roleRepository: {},
    authTokenRepository: {
      findValidForUpdate: async (tokenHash, tokenType, receivedExecutor) => {
        assert.equal(tokenHash.length, 64);
        assert.equal(tokenType, 'emailVerification');
        assert.equal(receivedExecutor, executor);
        return tokenRecord;
      },
      markUsed: async () => { state.used = true; },
    },
    emailService: {},
    transactionRunner: async (work) => work(executor),
  });
  return { service, state };
};

test('email verification consumes the token and returns a normal authenticated session', async () => {
  const { service, state } = createVerificationService();
  const session = await service.verifyEmail('a'.repeat(64));
  const decoded = jwt.verify(session.accessToken, env.jwt.secret, {
    issuer: env.appName,
    audience: 'trex-capital-market-api',
  });

  assert.equal(state.verified, true);
  assert.equal(state.used, true);
  assert.equal(state.lastLogin, true);
  assert.equal(session.tokenType, 'Bearer');
  assert.equal(session.expiresIn, env.jwt.expiry);
  assert.equal(session.user.emailVerified, true);
  assert.deepEqual(
    ['userUid', 'roleUid', 'fullName', 'email', 'roleName'].map((key) => decoded[key]),
    ['user-1', 'role-investor', 'Ada Lovelace', 'ada@example.com', 'Investor'],
  );
});

test('email verification never consumes the token or issues a session for an inactive role', async () => {
  const { service, state } = createVerificationService({ identity: { ...verifiedIdentity, roleActive: false } });
  await assert.rejects(
    service.verifyEmail('b'.repeat(64)),
    (error) => error.statusCode === 403 && error.code === 'FORBIDDEN',
  );
  assert.equal(state.verified, false);
  assert.equal(state.used, false);
  assert.equal(state.lastLogin, false);
});

test('an invalid, expired, or already-used verification token never issues a session', async () => {
  const { service, state } = createVerificationService({ tokenRecord: null });
  await assert.rejects(
    service.verifyEmail('c'.repeat(64)),
    (error) => error.statusCode === 400 && error.code === 'BAD_REQUEST',
  );
  assert.equal(state.verified, false);
  assert.equal(state.used, false);
  assert.equal(state.lastLogin, false);
});

test('password login and verification use the same JWT business claims and session shape', async () => {
  const passwordHash = await bcrypt.hash('Launch!234', 4);
  const state = { lastLogin: false };
  const service = new AuthService({
    userRepository: {
      findAuthIdentityByEmail: async () => ({ ...verifiedIdentity, emailVerified: true, passwordHash }),
      updateLastLogin: async () => { state.lastLogin = true; },
    },
    roleRepository: {}, authTokenRepository: {}, emailService: {},
  });
  const session = await service.login('ada@example.com', 'Launch!234');
  const decoded = jwt.decode(session.accessToken);
  assert.equal(state.lastLogin, true);
  assert.equal(session.user.emailVerified, true);
  assert.equal(decoded.userUid, session.user.userUid);
  assert.equal(decoded.roleUid, session.user.roleUid);
  assert.equal(decoded.roleName, session.user.roleName);
});
