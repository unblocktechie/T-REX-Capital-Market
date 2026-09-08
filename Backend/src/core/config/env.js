const path = require('node:path');
const Joi = require('joi');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const booleanValue = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
};

const csv = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appName: process.env.APP_NAME || 'T-REX Capital Market Backend',
  appVersion: process.env.APP_VERSION || '1.0.0',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY || '1h',
  },
  auth: {
    issuerRoleUid: process.env.ISSUER_ROLE_UID || '00000000-0000-4000-8000-000000000003',
    investorRoleUid: process.env.INVESTOR_ROLE_UID || '00000000-0000-4000-8000-000000000004',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
    verificationTtlMinutes: Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES || 1440),
    resetTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30),
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: booleanValue(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromName: process.env.SMTP_FROM_NAME || 'T-REX Capital Market',
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },
  cors: {
    allowedOrigins: csv(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173'),
    credentials: booleanValue(process.env.CORS_CREDENTIALS, true),
  },
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 100),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  },
  trustProxy: booleanValue(process.env.TRUST_PROXY),
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    retentionDays: Number(process.env.LOG_RETENTION_DAYS || 30),
  },
  uploads: {
    directory: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'storage/organization-documents'),
    maxFileSizeBytes: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10) * 1024 * 1024,
    maxFiles: Number(process.env.UPLOAD_MAX_FILES || 10),
  },
  blockchain: {
    sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL,
    deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
    deployerAddress: process.env.DEPLOYER_ADDRESS,
    identityFactoryAddress: process.env.IDENTITY_FACTORY_ADDRESS,
    confirmations: Number(process.env.BLOCKCHAIN_CONFIRMATIONS || 1),
    transactionTimeoutMs: Number(process.env.BLOCKCHAIN_TRANSACTION_TIMEOUT_MS || 120000),
  },
});

const requiredSchema = Joi.object({
  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  JWT_SECRET: Joi.string().min(32).required(),
  SMTP_HOST: Joi.string().required(),
  SMTP_USER: Joi.string().required(),
  SMTP_PASSWORD: Joi.string().required(),
  SMTP_FROM_EMAIL: Joi.string().email().required(),
}).unknown(true);

const validateEnvironment = () => {
  const { error } = requiredSchema.validate(process.env, { abortEarly: false });
  if (error) {
    throw new Error(`Invalid environment configuration: ${error.details.map((item) => item.message).join('; ')}`);
  }
};

module.exports = { env, validateEnvironment, csv };
