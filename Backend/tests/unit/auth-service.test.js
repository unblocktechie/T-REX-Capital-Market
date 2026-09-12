const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AuthService } = require('../../src/services/auth.service');
const { env } = require('../../src/core/config/env');

const issuerIdentity = {
  userUid: 'user-issuer-1',
  roleUid: env.auth.issuerRoleUid,
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  roleName: 'Issuer',
  emailVerified: false,
  isActive: true,
  roleActive: true,
  privyUserId: null,
  privyWalletId: null,
  privyWalletAddress: null,
};

const boundIssuerIdentity = {
  ...issuerIdentity,
  emailVerified: true,
  privyUserId: 'did:privy:user-1',
  privyWalletId: 'wallet-1',
  privyWalletAddress: '0x1111111111111111111111111111111111111111',
};

const verifiedPrivyIdentity = {
  privyUserId: boundIssuerIdentity.privyUserId,
  email: issuerIdentity.email,
  privyWalletId: boundIssuerIdentity.privyWalletId,
  privyWalletAddress: boundIssuerIdentity.privyWalletAddress,
};

const createService = (overrides = {}) => new AuthService({
  userRepository: {
    findByEmail: async () => null,
    findAuthIdentityByEmail: async () => issuerIdentity,
    findByPrivyUserId: async () => null,
    findByPrivyWalletAddress: async () => null,
    bindPrivyIdentity: async () => boundIssuerIdentity,
    updateLastLogin: async () => undefined,
    ...overrides.userRepository,
  },
  roleRepository: {
    findByUid: async (roleUid) => ({ roleUid, isActive: true }),
    ...overrides.roleRepository,
  },
  authTokenRepository: overrides.authTokenRepository || {},
  emailService: overrides.emailService || {},
  privyService: {
    verifyIdentityToken: async () => verifiedPrivyIdentity,
    ...overrides.privyService,
  },
  ...(overrides.transactionRunner ? { transactionRunner: overrides.transactionRunner } : {}),
});

test('signup saves the user before Privy verification and does not create an application verification token', async () => {
  let created;
  let emailSent = false;
  const service = createService({
    userRepository: {
      findByEmail: async () => null,
      create: async (payload) => {
        created = payload;
        return { userUid: 'user-1', ...payload };
      },
    },
    authTokenRepository: {
      create: async () => assert.fail('signup must not create an emailVerification auth token'),
    },
    emailService: {
      sendEmail: async () => { emailSent = true; },
    },
  });

  const user = await service.signup({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'Launch!234',
    isIssuer: true,
  });

  assert.equal(user.userUid, 'user-1');
  assert.equal(created.roleUid, env.auth.issuerRoleUid);
  assert.equal(created.emailVerified, false);
  assert.ok(await bcrypt.compare('Launch!234', created.passwordHash));
  assert.equal(emailSent, false);
});

test('issuer login accepts the password first and requires Privy OTP before issuing an app JWT', async () => {
  const passwordHash = await bcrypt.hash('Launch!234', 4);
  const service = createService({
    userRepository: {
      findAuthIdentityByEmail: async () => ({ ...issuerIdentity, passwordHash }),
    },
  });

  const result = await service.login('ada@example.com', 'Launch!234');
  assert.equal(result.privyVerificationRequired, true);
  assert.equal(result.email, 'ada@example.com');
  assert.equal(result.accessToken, undefined);
});

test('complete signup verifies and binds the Privy identity before issuing the application session', async () => {
  let boundPayload;
  let lastLoginUserUid;
  const service = createService({
    userRepository: {
      findAuthIdentityByEmail: async () => issuerIdentity,
      bindPrivyIdentity: async (userUid, payload) => {
        assert.equal(userUid, issuerIdentity.userUid);
        boundPayload = payload;
        return boundIssuerIdentity;
      },
      updateLastLogin: async (userUid) => { lastLoginUserUid = userUid; },
    },
  });

  const session = await service.completeSignup('ada@example.com', 'privy-identity-token');
  const decoded = jwt.verify(session.accessToken, env.jwt.secret, {
    issuer: env.appName,
    audience: 'trex-capital-market-api',
  });

  assert.deepEqual(boundPayload, verifiedPrivyIdentity);
  assert.equal(lastLoginUserUid, issuerIdentity.userUid);
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.privyWalletAddress, verifiedPrivyIdentity.privyWalletAddress);
  assert.equal(decoded.privyUserId, verifiedPrivyIdentity.privyUserId);
  assert.equal(decoded.privyWalletAddress, verifiedPrivyIdentity.privyWalletAddress);
});

test('Privy binding rejects an identity token whose verified email does not match the T-REX user', async () => {
  const service = createService({
    privyService: {
      verifyIdentityToken: async () => ({ ...verifiedPrivyIdentity, email: 'other@example.com' }),
    },
  });

  await assert.rejects(
    service.completeSignup('ada@example.com', 'privy-identity-token'),
    (error) => error.statusCode === 403 && error.code === 'FORBIDDEN',
  );
});

test('issuer login with a valid Privy identity token restores the same bound wallet', async () => {
  const passwordHash = await bcrypt.hash('Launch!234', 4);
  const service = createService({
    userRepository: {
      findAuthIdentityByEmail: async () => ({ ...boundIssuerIdentity, passwordHash }),
      bindPrivyIdentity: async () => boundIssuerIdentity,
    },
  });

  const session = await service.login('ada@example.com', 'Launch!234', 'privy-identity-token');
  assert.equal(session.user.privyUserId, boundIssuerIdentity.privyUserId);
  assert.equal(session.user.privyWalletAddress, boundIssuerIdentity.privyWalletAddress);
});

test('administrative roles keep password-only login and do not require a Privy wallet', async () => {
  const passwordHash = await bcrypt.hash('Launch!234', 4);
  const admin = {
    userUid: 'admin-1',
    roleUid: 'admin-role',
    fullName: 'Admin User',
    email: 'admin@example.com',
    roleName: 'Admin',
    emailVerified: true,
    isActive: true,
    roleActive: true,
    passwordHash,
  };
  const service = createService({
    userRepository: {
      findAuthIdentityByEmail: async () => admin,
    },
  });

  const session = await service.login('admin@example.com', 'Launch!234');
  assert.ok(session.accessToken);
  assert.equal(session.user.roleName, 'Admin');
  assert.equal(session.user.privyWalletAddress, undefined);
});

test('forgot password still rejects an unregistered email with signup guidance', async () => {
  const service = createService({ userRepository: { findByEmail: async () => null } });
  await assert.rejects(
    service.forgotPassword('missing@example.com'),
    (error) => error.statusCode === 404
      && error.code === 'NOT_FOUND'
      && error.message === 'This email is not registered. Please sign up first.',
  );
});
