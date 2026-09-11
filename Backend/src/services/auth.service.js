const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');
const { TOKEN_TYPES } = require('../config/constants');
const { createOpaqueToken, hashToken } = require('../utils/token');
const { withTransaction } = require('../database/connection');
const { verificationEmail, passwordResetEmail } = require('./common/email-template.service');

const resolveSignupRoleUid = (isIssuer) => (
  isIssuer ? env.auth.issuerRoleUid : env.auth.investorRoleUid
);

class AuthService {
  constructor({
    userRepository,
    roleRepository,
    authTokenRepository,
    emailService,
    transactionRunner = withTransaction,
  }) {
    this.userRepository = userRepository;
    this.roleRepository = roleRepository;
    this.authTokenRepository = authTokenRepository;
    this.emailService = emailService;
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
    if (await this.userRepository.findByEmail(email)) throw ApiError.conflict('An account with this email already exists.');
    const selectedRoleUid = resolveSignupRoleUid(isIssuer);
    const role = await this.roleRepository.findByUid(selectedRoleUid);
    if (!role || !role.isActive) {
      throw new ApiError(500, 'The selected signup role is not configured.', undefined, 'SIGNUP_ROLE_NOT_CONFIGURED');
    }
    const passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
    const rawToken = createOpaqueToken();

    const user = await this.transactionRunner(async (connection) => {
      const created = await this.userRepository.create({
        roleUid: role.roleUid,
        fullName,
        email,
        passwordHash,
        emailVerified: false,
        isActive: true,
        isDeleted: false,
      }, connection);
      await this.authTokenRepository.create(
        this.tokenRecord(created.userUid, TOKEN_TYPES.EMAIL_VERIFICATION, rawToken, env.auth.verificationTtlMinutes),
        connection,
      );
      return created;
    });

    await this.emailService.sendEmail({ to: user.email, ...verificationEmail({ fullName: user.fullName, token: rawToken }) });
    return user;
  }

  async resendVerification(email) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || user.emailVerified || !user.isActive) return;
    const rawToken = createOpaqueToken();
    await this.transactionRunner(async (connection) => {
      await this.authTokenRepository.revokeActive(user.userUid, TOKEN_TYPES.EMAIL_VERIFICATION, connection);
      await this.authTokenRepository.create(
        this.tokenRecord(user.userUid, TOKEN_TYPES.EMAIL_VERIFICATION, rawToken, env.auth.verificationTtlMinutes),
        connection,
      );
    });
    await this.emailService.sendEmail({ to: user.email, ...verificationEmail({ fullName: user.fullName, token: rawToken }) });
  }

  async verifyEmail(token) {
    const tokenHash = hashToken(token);
    return this.transactionRunner(async (connection) => {
      const record = await this.authTokenRepository.findValidForUpdate(
        tokenHash,
        TOKEN_TYPES.EMAIL_VERIFICATION,
        connection,
      );
      if (!record) throw ApiError.badRequest('Verification link is invalid or has expired.');
      const user = await this.userRepository.findByUid(record.userUid, connection);
      if (!user) throw ApiError.badRequest('Verification link is invalid or has expired.');

      const authIdentity = await this.userRepository.findAuthIdentityByUid(user.userUid, connection);
      this.assertAccountActive(authIdentity);

      await this.userRepository.markEmailVerified(user.userUid, connection);
      await this.authTokenRepository.markUsed(record.tokenUid, connection);
      return this.createAuthenticationSession({ ...authIdentity, emailVerified: true }, connection);
    });
  }

  assertAccountActive(user) {
    if (!user || !user.isActive || !user.roleActive) {
      throw ApiError.forbidden('This account is inactive. Please contact support.');
    }
  }

  // The only JWT/session factory used by password login and email-verification login. Keep
  // authentication claims here so both entry points always issue identical tokens.
  async createAuthenticationSession(user, executor) {
    this.assertAccountActive(user);
    const claims = {
      userUid: user.userUid,
      roleUid: user.roleUid,
      fullName: user.fullName,
      email: user.email,
      roleName: user.roleName,
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
      user: { ...claims, emailVerified: Boolean(user.emailVerified) },
    };
  }

  async login(email, password) {
    const user = await this.userRepository.findAuthIdentityByEmail(email);
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      throw ApiError.unauthorized('Email or password is incorrect.');
    }
    this.assertAccountActive(user);
    if (!user.emailVerified) throw ApiError.forbidden('Please verify your email before logging in.');
    return this.createAuthenticationSession(user);
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

module.exports = { AuthService, resolveSignupRoleUid };
