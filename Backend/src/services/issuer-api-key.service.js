const crypto = require('node:crypto');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { createOpaqueToken, createUid, hashToken } = require('../utils/token');
const { positiveSetting } = require('../utils/positive-setting');

const API_KEY_PREFIX = 'trex_iss_';
const API_KEY_PATTERN = /^trex_iss_([a-f0-9]{24})_([a-f0-9]{64})$/;
const PRICE_API_SCOPES = Object.freeze([
  'TOKEN_PRICE_PREPARE',
  'TOKEN_PRICE_SUBMIT',
  'TOKEN_PRICE_READ',
]);

const parseScopes = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeEqualHash = (left, right) => {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

class IssuerApiKeyService {
  constructor({ repository, userRepository, organizationRepository, settingRepository, policyService, transactionRunner = withTransaction }) {
    this.policyService = policyService;
    this.repository = repository;
    this.userRepository = userRepository;
    this.organizationRepository = organizationRepository;
    this.settingRepository = settingRepository;
    this.transactionRunner = transactionRunner;
  }

  assertIssuer(user) {
    if (user?.roleName !== 'Issuer') throw ApiError.forbidden('Issuer API keys are available only to issuer accounts.');
  }

  async requireApprovedOrganization(user, executor) {
    this.assertIssuer(user);
    const organization = await this.organizationRepository.findByUserUid(user.userUid, executor);
    if (!organization || organization.status !== 'approved') {
      throw ApiError.conflict('An approved issuer organization is required before issuing an API key.');
    }
    return organization;
  }

  present(row) {
    return {
      issuerApiKeyUid: row.issuerApiKeyUid,
      name: row.keyName,
      maskedKey: `${row.keyPrefix}...${row.keyLastFour}`,
      scopes: parseScopes(row.scopes),
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      lastUsedIp: row.lastUsedIp,
      revokedAt: row.revokedAt,
      isActive: Boolean(row.isActive) && !row.revokedAt && new Date(row.expiresAt).getTime() > Date.now(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  buildKey() {
    const publicId = crypto.randomBytes(12).toString('hex');
    const secret = createOpaqueToken();
    const apiKey = `${API_KEY_PREFIX}${publicId}_${secret}`;
    return { publicId, apiKey };
  }

  buildExpiry(expiresInDays) {
    const days = Number(expiresInDays || 365);
    return new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
  }

  async createRecord(user, organization, input, metadata, executor, { enforceLimit = true } = {}) {
    const limit = await positiveSetting(this.settingRepository, 'IssuerApiKeyMaxActive', 5, executor);
    if (enforceLimit && await this.repository.countActive(user.userUid, executor) >= limit) {
      throw new ApiError(
        409,
        `A maximum of ${limit} active issuer API keys is allowed. Revoke an existing key first.`,
        undefined,
        'ISSUER_API_KEY_LIMIT_REACHED',
      );
    }
    const { publicId, apiKey } = this.buildKey();
    const issuerApiKeyUid = createUid();
    const row = await this.repository.create({
      issuerApiKeyUid,
      publicId,
      userUid: user.userUid,
      organizationUid: organization.organizationUid,
      keyName: input.name,
      keyHash: hashToken(apiKey),
      keyPrefix: `${API_KEY_PREFIX}${publicId.slice(0, 8)}`,
      keyLastFour: apiKey.slice(-4),
      scopes: PRICE_API_SCOPES,
      expiresAt: this.buildExpiry(input.expiresInDays),
    }, executor);
    const policy = this.policyService ? await this.policyService.save(issuerApiKeyUid,
      Object.fromEntries(Object.keys(require('../schemas/issuer-api-key-policy.schema').policyFields)
        .filter(key => input[key] !== undefined).map(key => [key, input[key]])), executor) : undefined;
    await this.repository.createAudit({
      issuerApiKeyUid,
      userUid: user.userUid,
      action: 'CREATED',
      ...metadata,
      details: { name: input.name, scopes: PRICE_API_SCOPES },
    }, executor);
    return {
      ...this.present(row),
      ...(policy ? { policy } : {}),
      apiKey,
      warning: 'Store this API key securely now. It cannot be retrieved again.',
    };
  }

  async create(user, input, metadata = {}) {
    return this.transactionRunner(async (connection) => {
      await this.repository.lockOwner(user.userUid, connection);
      const organization = await this.requireApprovedOrganization(user, connection);
      return this.createRecord(user, organization, input, metadata, connection);
    });
  }

  async list(user) {
    this.assertIssuer(user);
    return this.transactionRunner(async (connection) => {
      await this.repository.lockOwner(user.userUid, connection);
      await this.requireApprovedOrganization(user, connection);
      const maxActiveKeys = await positiveSetting(this.settingRepository, 'IssuerApiKeyMaxActive', 5, connection);
      const activeKeyCount = await this.repository.countActive(user.userUid, connection);
      const rows = await this.repository.listOwned(user.userUid, connection);
      return {
        keys: await Promise.all(rows.map(async row => ({ ...this.present(row),
          ...(this.policyService ? { policy: await this.policyService.get(row.issuerApiKeyUid, connection) } : {}) }))),
        meta: { maxActiveKeys, activeKeyCount, remainingSlots: Math.max(0, maxActiveKeys - activeKeyCount) },
      };
    });
  }

  async revoke(user, issuerApiKeyUid, metadata = {}) {
    return this.transactionRunner(async (connection) => {
      await this.repository.lockOwner(user.userUid, connection);
      await this.requireApprovedOrganization(user, connection);
      const row = await this.repository.findOwnedByUid(issuerApiKeyUid, user.userUid, connection);
      if (!row) throw ApiError.notFound('Issuer API key was not found.');
      if (!row.revokedAt && row.isActive) {
        await this.repository.revoke(issuerApiKeyUid, user.userUid, connection);
        await this.repository.createAudit({
          issuerApiKeyUid, userUid: user.userUid, action: 'REVOKED', ...metadata,
        }, connection);
      }
      return { ...this.present({ ...row, isActive: false, revokedAt: row.revokedAt || new Date() }), isActive: false };
    });
  }

  async rotate(user, issuerApiKeyUid, input, metadata = {}) {
    return this.transactionRunner(async (connection) => {
      await this.repository.lockOwner(user.userUid, connection);
      const organization = await this.requireApprovedOrganization(user, connection);
      const current = await this.repository.findOwnedByUid(issuerApiKeyUid, user.userUid, connection);
      if (!current || current.isDeleted || current.revokedAt || !current.isActive
        || !(new Date(current.expiresAt).getTime() > Date.now())) {
        throw new ApiError(409, 'This key is no longer active. Create a new key instead.', undefined, 'ISSUER_API_KEY_NOT_ACTIVE');
      }
      await this.repository.revoke(issuerApiKeyUid, user.userUid, connection);
      await this.repository.createAudit({
        issuerApiKeyUid, userUid: user.userUid, action: 'ROTATED', ...metadata,
      }, connection);
      return this.createRecord(user, organization, {
        ...(this.policyService ? await this.policyService.get(current.issuerApiKeyUid, connection) : {}),
        name: input.name || `${current.keyName} (rotated)`,
        expiresInDays: input.expiresInDays,
      }, metadata, connection, { enforceLimit: false });
    });
  }

  async authenticate(apiKey, requiredScope, metadata = {}) {
    const match = API_KEY_PATTERN.exec(String(apiKey || '').trim());
    if (!match) throw ApiError.unauthorized('The issuer API key is invalid.');
    const row = await this.repository.findByPublicId(match[1]);
    if (!row || !safeEqualHash(row.keyHash, hashToken(apiKey))) {
      throw ApiError.unauthorized('The issuer API key is invalid.');
    }
    if (!row.isActive || row.revokedAt) {
      throw new ApiError(401, 'The issuer API key has been revoked.', undefined, 'ISSUER_API_KEY_REVOKED');
    }
    if (new Date(row.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(401, 'The issuer API key has expired.', undefined, 'ISSUER_API_KEY_EXPIRED');
    }
    const scopes = parseScopes(row.scopes);
    if (!scopes.includes(requiredScope)) {
      throw new ApiError(403, 'The issuer API key does not include the required scope.', undefined, 'ISSUER_API_KEY_SCOPE_REQUIRED');
    }
    if (this.policyService) await this.policyService.assertIp(row.issuerApiKeyUid, metadata.ipAddress);
    const user = await this.userRepository.findAuthIdentityByUid(row.userUid);
    if (!user || !user.isActive || !user.roleActive || !user.emailVerified || user.roleName !== 'Issuer') {
      throw ApiError.unauthorized('The issuer account associated with this API key is no longer active.');
    }
    const organization = await this.organizationRepository.findByUserUid(user.userUid);
    if (!organization || organization.organizationUid !== row.organizationUid || organization.status !== 'approved') {
      throw ApiError.unauthorized('The organization associated with this API key is no longer eligible.');
    }
    await this.transactionRunner(async (connection) => {
      await this.repository.markUsed(row.issuerApiKeyUid, metadata.ipAddress, connection);
      await this.repository.createAudit({
        issuerApiKeyUid: row.issuerApiKeyUid,
        userUid: row.userUid,
        action: 'AUTHENTICATED',
        ...metadata,
        details: { requiredScope },
      }, connection);
    });
    return { user, apiKey: { ...row, scopes } };
  }
  async updatePolicy(user, uid, input, metadata = {}) {
    return this.transactionRunner(async connection => {
      await this.repository.lockOwner(user.userUid, connection);
      await this.requireApprovedOrganization(user, connection);
      const row = await this.repository.findOwnedByUid(uid, user.userUid, connection);
      if (!row) throw ApiError.notFound('Issuer API key was not found.');
      const before = await this.policyService.get(uid, connection);
      const policy = await this.policyService.save(uid, input, connection);
      await this.repository.createAudit({ issuerApiKeyUid: uid, userUid: user.userUid,
        action: 'POLICY_UPDATED', ...metadata, details: { before, after: policy } }, connection);
      return { issuerApiKeyUid: uid, policy };
    });
  }
}

module.exports = {
  IssuerApiKeyService,
  API_KEY_PREFIX,
  PRICE_API_SCOPES,
};
