const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');
const { TOKEN_TYPES } = require('../config/constants');
const { createOpaqueToken, hashToken } = require('../utils/token');
const { withTransaction } = require('../database/connection');
const { passwordResetEmail } = require('./common/email-template.service');

const resolveSignupRoleUid = (isIssuer) => (
  isIssuer ? env.auth.issuerRoleUid : env.auth.investorRoleUid
);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeWalletAddress = (value) => String(value || '').trim().toLowerCase();
const requiresPrivyWalletIdentity = (user) => ['Issuer', 'Investor'].includes(user?.roleName);

class AuthService {
  constructor({
    userRepository,
    roleRepository,
    authTokenRepository,
    emailService,
    privyService,
    transactionRunner = withTransaction,
  }) {
    this.userRepository = userRepository;
    this.roleRepository = roleRepository;
    this.authTokenRepository = authTokenRepository;
    this.emailService = emailService;
    this.privyService = privyService;
    this.transactionRunner = transactionRunner;
  }

  tokenRecord(userUid, tokenType, token, ttlMinutes) {
    return {
      userUid,
      tokenType,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      isActive: true,
      isDeleted: false,
    };
  }

  async signup({ fullName, email, password, isIssuer }) {
    if (await this.userRepository.findByEmail(email)) {
      throw ApiError.conflict('An account with this email already exists.');
    }

    const selectedRoleUid = resolveSignupRoleUid(isIssuer);
    const role = await this.roleRepository.findByUid(selectedRoleUid);
    if (!role || !role.isActive) {
      throw new ApiError(500, 'The selected signup role is not configured.', undefined, 'SIGNUP_ROLE_NOT_CONFIGURED');
    }

    const passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
    // V2 deliberately persists the account before sending any verification email.
    // Privy owns the email-OTP lifecycle; the application no longer creates an
    // emailVerification authToken or sends its own verification link.
    return this.userRepository.create({
      roleUid: role.roleUid,
      fullName,
      email,
      passwordHash,
      emailVerified: false,
      isActive: true,
      isDeleted: false,
    });
  }

  assertAccountActive(user) {
    if (!user || !user.isActive || !user.roleActive) {
      throw ApiError.forbidden('This account is inactive. Please contact support.');
    }
  }

  async assertCredentials(email, password, executor) {
    const user = await this.userRepository.findAuthIdentityByEmail(email, executor);
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      throw ApiError.unauthorized('Email or password is incorrect.');
    }
    this.assertAccountActive(user);
    return user;
  }

  async bindOrAssertPrivyIdentity(user, identityToken, executor) {
    const verified = await this.privyService.verifyIdentityToken(identityToken);
    if (normalizeEmail(verified.email) !== normalizeEmail(user.email)) {
      throw ApiError.forbidden('The Privy-verified email does not match this T-REX account.');
    }

    const existingPrivyOwner = await this.userRepository.findByPrivyUserId(verified.privyUserId, executor);
    if (existingPrivyOwner && existingPrivyOwner.userUid !== user.userUid) {
      throw ApiError.conflict('This Privy identity is already linked to another T-REX account.');
    }
    const existingWalletOwner = await this.userRepository.findByPrivyWalletAddress(
      verified.privyWalletAddress,
      executor,
    );
    if (existingWalletOwner && existingWalletOwner.userUid !== user.userUid) {
      throw ApiError.conflict('This Privy wallet is already linked to another T-REX account.');
    }

    if (user.privyUserId && user.privyUserId !== verified.privyUserId) {
      throw ApiError.forbidden('This T-REX account is linked to a different Privy identity.');
    }
    if (
      user.privyWalletAddress
      && normalizeWalletAddress(user.privyWalletAddress) !== verified.privyWalletAddress
    ) {
      throw ApiError.forbidden('This T-REX account is linked to a different Privy wallet.');
    }

    try {
      return await this.userRepository.bindPrivyIdentity(user.userUid, verified, executor);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw ApiError.conflict('The Privy identity or wallet is already linked to another account.');
      }
      throw error;
    }
  }

  // The backend JWT remains the application authorization token. Privy is the verified
  // authentication + wallet identity source used before this session is issued.
  async createAuthenticationSession(user, executor) {
    this.assertAccountActive(user);
    const claims = {
      userUid: user.userUid,
      roleUid: user.roleUid,
      fullName: user.fullName,
      email: user.email,
      roleName: user.roleName,
      privyUserId: user.privyUserId,
      privyWalletAddress: user.privyWalletAddress,
    };
    const accessToken = jwt.sign(claims, env.jwt.secret, {
      expiresIn: env.jwt.expiry,
      issuer: env.appName,
      audience: 'trex-capital-market-api',
      subject: user.userUid,
    });
    await this.userRepository.updateLastLogin(user.userUid, executor);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: env.jwt.expiry,
      user: {
        ...claims,
        emailVerified: Boolean(user.emailVerified),
        privyWalletId: user.privyWalletId || null,
      },
    };
  }

  async completeSignup(email, identityToken) {
    const user = await this.userRepository.findAuthIdentityByEmail(email);
    if (!user) throw ApiError.notFound('The signup account was not found. Please sign up again.');
    this.assertAccountActive(user);
    if (!requiresPrivyWalletIdentity(user)) {
      throw ApiError.forbidden('Privy wallet signup completion is available only to issuer and investor accounts.');
    }

    const boundUser = await this.bindOrAssertPrivyIdentity(user, identityToken);
    return this.createAuthenticationSession(boundUser);
  }

  async login(email, password, identityToken) {
    const user = await this.assertCredentials(email, password);

    // Administrative/legacy managed roles do not participate in the embedded-wallet flow.
    // Preserve their existing password login behavior; issuer/investor accounts must prove
    // their Privy email identity before an application JWT is issued.
    if (!requiresPrivyWalletIdentity(user)) {
      if (!user.emailVerified) {
        throw ApiError.forbidden('This account has not been verified. Please contact support.');
      }
      return this.createAuthenticationSession(user);
    }

    // Phase 1: password is valid, now run Privy email OTP in the browser. No app JWT is
    // issued until the Privy identity token proves the email + embedded wallet binding.
    if (!identityToken) {
      return {
        privyVerificationRequired: true,
        email: user.email,
        hasLinkedPrivyIdentity: Boolean(user.privyUserId && user.privyWalletAddress),
      };
    }

    const boundUser = await this.bindOrAssertPrivyIdentity(user, identityToken);
    return this.createAuthenticationSession(boundUser);
  }

  async forgotPassword(email) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw ApiError.notFound('This email is not registered. Please sign up first.');
    if (!user.isActive) throw ApiError.forbidden('This account is inactive. Please contact support.');
    const rawToken = createOpaqueToken();
    await this.transactionRunner(async (connection) => {
      await this.authTokenRepository.revokeActive(user.userUid, TOKEN_TYPES.PASSWORD_RESET, connection);
      await this.authTokenRepository.create(
        this.tokenRecord(user.userUid, TOKEN_TYPES.PASSWORD_RESET, rawToken, env.auth.resetTtlMinutes),
        connection,
      );
    });
    await this.emailService.sendEmail({ to: user.email, ...passwordResetEmail({ fullName: user.fullName, token: rawToken }) });
  }

  async verifyResetToken(token) {
    const record = await this.authTokenRepository.findValid(hashToken(token), TOKEN_TYPES.PASSWORD_RESET);
    if (!record) throw ApiError.badRequest('Password reset link is invalid or has expired.');
    return true;
  }

  async resetPassword(token, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, env.auth.bcryptRounds);
    await this.transactionRunner(async (connection) => {
      const record = await this.authTokenRepository.findValid(hashToken(token), TOKEN_TYPES.PASSWORD_RESET, connection);
      if (!record) throw ApiError.badRequest('Password reset link is invalid or has expired.');
      await this.userRepository.updatePassword(record.userUid, passwordHash, connection);
      await this.authTokenRepository.markUsed(record.tokenUid, connection);
      await this.authTokenRepository.revokeActive(record.userUid, TOKEN_TYPES.PASSWORD_RESET, connection);
    });
  }
}

module.exports = { AuthService, resolveSignupRoleUid, requiresPrivyWalletIdentity };
