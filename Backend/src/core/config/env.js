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

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

const csvOrigins = (value) => [...new Set(csv(value).map(normalizeOrigin).filter(Boolean))];

const csvNumbers = (value) => csv(value)
  .map((item) => Number(item))
  .filter((item) => Number.isInteger(item) && item > 0);

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
  privy: {
    appId: process.env.PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET,
  },
  auth: {
    issuerRoleUid: process.env.ISSUER_ROLE_UID || '00000000-0000-4000-8000-000000000003',
    investorRoleUid: process.env.INVESTOR_ROLE_UID || '00000000-0000-4000-8000-000000000004',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 2),
    resetTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30),
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: booleanValue(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromName: process.env.SMTP_FROM_NAME || 'Trex Capital Market',
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },
  cors: {
    allowedOrigins: csvOrigins(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173'),
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
  investorUploads: {
    directory: path.resolve(process.cwd(), process.env.INVESTOR_UPLOAD_DIR || 'storage/investor-documents'),
    maxFileSizeBytes: Number(process.env.INVESTOR_UPLOAD_MAX_FILE_SIZE_MB || process.env.UPLOAD_MAX_FILE_SIZE_MB || 10) * 1024 * 1024,
    maxFiles: Number(process.env.INVESTOR_UPLOAD_MAX_FILES || process.env.UPLOAD_MAX_FILES || 10),
  },
  tokenImages: {
    directory: path.resolve(process.cwd(), process.env.TOKEN_IMAGE_UPLOAD_DIR || 'storage/token-images'),
    maxFileSizeBytes: Number(process.env.TOKEN_IMAGE_MAX_FILE_SIZE_MB || 2) * 1024 * 1024,
    minDimension: Number(process.env.TOKEN_IMAGE_MIN_DIMENSION || 256),
    maxDimension: Number(process.env.TOKEN_IMAGE_MAX_DIMENSION || 4096),
    optimizedMaxDimension: Number(process.env.TOKEN_IMAGE_OPTIMIZED_MAX_DIMENSION || 1024),
    virusScannerPath: process.env.TOKEN_IMAGE_VIRUS_SCANNER_PATH || null,
    virusScanTimeoutMs: Number(process.env.TOKEN_IMAGE_VIRUS_SCAN_TIMEOUT_MS || 30000),
  },
  blockchain: {
    sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL,
    sepoliaFallbackRpcUrls: csv(process.env.SEPOLIA_FALLBACK_RPC_URLS),
    deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
    deployerAddress: process.env.DEPLOYER_ADDRESS,
    // Backend-authoritative Token Agent assigned to every newly configured TREX token.
    platformControllerAddress: process.env.PLATFORM_CONTROLLER_ADDRESS
      || '0x40e81FAA4e6D54ae0632DF146939bB5858359271',
    identityFactoryAddress: process.env.IDENTITY_FACTORY_ADDRESS,
    trexFactoryAddress: process.env.TREX_FACTORY_ADDRESS,
    confirmations: Number(process.env.BLOCKCHAIN_CONFIRMATIONS || 2),
    // Registry confirmation is intentionally conservative because CONFIRMED is authoritative.
    registryConfirmations: Number(process.env.REGISTRY_CONFIRMATIONS || 2),
    // MetaMask may wrap registerIdentity through its audited Delegation Manager. Only explicitly
    // configured executors are accepted; the nested target, value, function and arguments are
    // still decoded and verified against the pending operation.
    registryDelegationManagerAddresses: csv(
      process.env.REGISTRY_DELEGATION_MANAGER_ADDRESSES
        || '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    ),
    transactionDelegationManagerAddresses: csv(
      process.env.TRANSACTION_DELEGATION_MANAGER_ADDRESSES
        || process.env.REGISTRY_DELEGATION_MANAGER_ADDRESSES
        || '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    ),
    registryRecoveryLookbackBlocks: Number(process.env.REGISTRY_RECOVERY_LOOKBACK_BLOCKS || 200000),
    registryRecoveryBlockOffset: Number(process.env.REGISTRY_RECOVERY_BLOCK_OFFSET || 20000),
    registryRpcEvidenceAttempts: Number(process.env.REGISTRY_RPC_EVIDENCE_ATTEMPTS || 5),
    transactionTimeoutMs: Number(process.env.BLOCKCHAIN_TRANSACTION_TIMEOUT_MS || 120000),
    // Block to start on-chain log lookups from (factory deploy block). 0 = from genesis.
    trexFactoryStartBlock: Number(process.env.TREX_FACTORY_START_BLOCK || 0),
    // Global investor-claim indexer start block. When omitted, the TREX factory start block is a
    // conservative platform deployment fallback; zero starts one configured chunk behind safe head.
    claimIndexerStartBlock: Number(process.env.CLAIM_INDEXER_START_BLOCK || process.env.TREX_FACTORY_START_BLOCK || 0),
    registryIndexerStartBlock: Number(process.env.REGISTRY_INDEXER_START_BLOCK || process.env.TREX_FACTORY_START_BLOCK || 0),
    // Salt-reconcile event scan: window size per eth_getLogs (stay under the RPC range cap)
    // and the maximum blocks to look back when no start block is configured.
    reconcileBlockOffset: Number(process.env.RECONCILE_BLOCK_OFFSET || 9000),
    reconcileMaxLookbackBlocks: Number(process.env.RECONCILE_MAX_LOOKBACK_BLOCKS || 1000000),
    // Chain configuration for the deployment-attempt flow. Sepolia = 11155111.
    chainId: Number(process.env.BLOCKCHAIN_CHAIN_ID || 11155111),
    supportedChainIds: csvNumbers(process.env.SUPPORTED_CHAIN_IDS || process.env.BLOCKCHAIN_CHAIN_ID || '11155111'),
    networkName: process.env.BLOCKCHAIN_NETWORK_NAME || 'sepolia',
    // How long a pending (pre-broadcast) deployment attempt stays valid.
    deploymentAttemptTtlMinutes: Number(process.env.DEPLOYMENT_ATTEMPT_TTL_MINUTES || 20),
    // Master switch for the background deployment-sync runner (overrides the DB setting when false).
    deploymentSyncEnabled: booleanValue(process.env.TREX_DEPLOYMENT_SYNC_ENABLED, true),
    purchaseUsdtAddress: process.env.PURCHASE_USDT_ADDRESS || '0x8fC7e68897bd74c4B6340d2DC857a7ED2677aF6A',
    // The interactive confirm API may accept a successfully mined payment earlier than the
    // conservative worker finality threshold so it can submit the platform mint immediately.
    purchasePaymentConfirmations: Number(process.env.PURCHASE_PAYMENT_CONFIRMATIONS || 2),
    purchaseConfirmations: Number(process.env.PURCHASE_CONFIRMATIONS || 2),
    // A payment intent with no submitted hash is abandoned after this period. The worker
    // applies an additional indexed-chain grace period before changing it to EXPIRED.
    purchaseIntentTtlMinutes: Number(process.env.PURCHASE_INTENT_TTL_MINUTES || 15),
    purchaseIndexerStartBlock: Number(process.env.PURCHASE_INDEXER_START_BLOCK || 0),
    purchaseWorkerEnabled: booleanValue(process.env.PURCHASE_WORKER_ENABLED, true),
    // Manual issuer-funded redemption. Payment and all platform token actions are independently
    // verified at the conservative redemption confirmation threshold.
    redemptionUsdtAddress: process.env.REDEMPTION_USDT_ADDRESS
      || process.env.PURCHASE_USDT_ADDRESS || '0x8fC7e68897bd74c4B6340d2DC857a7ED2677aF6A',
    redemptionConfirmations: Number(process.env.REDEMPTION_CONFIRMATIONS || 2),
    redemptionAuthorizationTtlMinutes: Number(process.env.REDEMPTION_AUTHORIZATION_TTL_MINUTES || 30),
    redemptionIndexerStartBlock: Number(process.env.REDEMPTION_INDEXER_START_BLOCK || 0),
    redemptionWorkerEnabled: booleanValue(process.env.REDEMPTION_WORKER_ENABLED, true),
    // Investor-to-investor ERC-3643 transfers. Interactive confirmation can be low for local
    // UX while the global fallback indexer remains behind a conservative safe head.
    transferConfirmations: Number(process.env.TRANSFER_CONFIRMATIONS || 2),
    transferIndexerConfirmations: Number(process.env.TRANSFER_INDEXER_CONFIRMATIONS || 2),
    transferIntentTtlMinutes: Number(process.env.TRANSFER_INTENT_TTL_MINUTES || 15),
    transferIndexerStartBlock: Number(process.env.TRANSFER_INDEXER_START_BLOCK || 0),
    transferWorkerEnabled: booleanValue(process.env.TRANSFER_WORKER_ENABLED, true),
    // Canonical read-only history for wallet-executed Platform Controller and token transactions.
    transactionIndexerEnabled: booleanValue(process.env.TRANSACTION_INDEXER_ENABLED, true),
    transactionIndexerStartBlock: Number(process.env.TRANSACTION_INDEXER_START_BLOCK || 0),
    transactionIndexerConfirmations: Number(process.env.TRANSACTION_INDEXER_CONFIRMATIONS || process.env.BLOCKCHAIN_CONFIRMATIONS || 2),
  },
});

const requiredSchema = Joi.object({
  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  JWT_SECRET: Joi.string().min(32).required(),
  PRIVY_APP_ID: Joi.string().required(),
  PRIVY_APP_SECRET: Joi.string().required(),
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

module.exports = { env, validateEnvironment, csv, csvNumbers, normalizeOrigin, csvOrigins };
