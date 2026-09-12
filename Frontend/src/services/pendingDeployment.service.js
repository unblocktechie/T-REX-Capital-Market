import { getAddress, isAddress } from 'viem';
import { STORAGE_KEYS } from '@/constants';
import { web3Config } from '@/config/web3';
import { assertValidTransactionHash } from '@/utils/transactionHash';

const PENDING_DEPLOYMENT_VERSION = 1;
const PENDING_DEPLOYMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const getStorages = () => {
  if (typeof window === 'undefined') return [];
  const storages = [];
  try {
    storages.push(window.localStorage);
  } catch {
    // Local storage may be disabled by browser privacy controls.
  }
  try {
    storages.push(window.sessionStorage);
  } catch {
    // Session storage may also be unavailable in restricted contexts.
  }
  return storages.filter(Boolean);
};

const text = (value) => String(value ?? '').trim();

export const getDeploymentUserKey = (user) =>
  text(user?.userUid || user?.uid || user?.id || user?.email).toLowerCase();

const normalizeAddress = (value) => {
  const candidate = text(value);
  return candidate && isAddress(candidate, { strict: false })
    ? getAddress(candidate.toLowerCase())
    : '';
};

const normalizeContracts = (contracts) => {
  if (!contracts || typeof contracts !== 'object') return {};
  return Object.fromEntries(
    ['token', 'ir', 'irs', 'tir', 'ctr', 'mc']
      .map((key) => [key, normalizeAddress(contracts[key])])
      .filter(([, value]) => Boolean(value)),
  );
};

const normalizePriceSetup = (priceSetup) => {
  if (!priceSetup || typeof priceSetup !== 'object') return {};
  return {
    status: text(priceSetup.status),
    transactionHash: text(priceSetup.transactionHash),
    currentTokenPrice: text(priceSetup.currentTokenPrice),
    priceRaw: text(priceSetup.priceRaw),
    paymentToken: normalizeAddress(priceSetup.paymentToken),
    error: text(priceSetup.error).slice(0, 1000),
  };
};

const removeStoredRecord = () => {
  getStorages().forEach((storage) => {
    try {
      storage.removeItem(STORAGE_KEYS.pendingTokenDeployment);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  });
};

const normalizeRecord = (value) => {
  if (!value || typeof value !== 'object' || value.version !== PENDING_DEPLOYMENT_VERSION) {
    return null;
  }

  try {
    const transactionHash = assertValidTransactionHash(value.transactionHash);
    const userKey = text(value.userKey).toLowerCase();
    const chainId = Number(value.chainId);
    const createdAt = Number(value.createdAt);
    const expiresAt = Number(value.expiresAt);
    const issuerWallet = normalizeAddress(value.issuerWallet);

    if (
      !userKey ||
      !issuerWallet ||
      chainId !== Number(web3Config.requiredChain.id) ||
      !Number.isFinite(createdAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      return null;
    }

    const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};

    const status = value.status === 'submitted' ? 'submitted' : 'confirmed';

    return {
      version: PENDING_DEPLOYMENT_VERSION,
      status,
      transactionHash,
      userKey,
      chainId,
      network: text(value.network || web3Config.requiredChain.name),
      issuerWallet,
      tokenUid: text(value.tokenUid || metadata.tokenUid),
      metadata: {
        tokenUid: text(metadata.tokenUid || value.tokenUid),
        tokenName: text(metadata.tokenName),
        symbol: text(metadata.symbol).toUpperCase(),
        network: text(metadata.network || value.network || web3Config.requiredChain.name),
        chainId,
        deploymentAttemptUid: text(metadata.deploymentAttemptUid),
        idempotencyKey: text(metadata.idempotencyKey),
        attemptStatus: text(metadata.attemptStatus),
        blockNumber: text(metadata.blockNumber),
        deployedAt: text(metadata.deployedAt),
        tokenAddress: normalizeAddress(metadata.tokenAddress || metadata.contracts?.token),
        contracts: normalizeContracts(metadata.contracts),
        configurationStatus: text(metadata.configurationStatus),
        onChainPaused:
          typeof metadata.onChainPaused === 'boolean' ? metadata.onChainPaused : null,
        unpauseTransactionHash: text(metadata.unpauseTransactionHash),
        failedStep: text(metadata.failedStep),
        failedTransactionHash: text(metadata.failedTransactionHash),
        configurationError: text(metadata.configurationError).slice(0, 1000),
        priceSetup: normalizePriceSetup(metadata.priceSetup),
      },
      createdAt,
      expiresAt,
    };
  } catch {
    return null;
  }
};

const readStoredRecord = () => {
  for (const storage of getStorages()) {
    try {
      const raw = storage.getItem(STORAGE_KEYS.pendingTokenDeployment);
      if (!raw) continue;
      const record = normalizeRecord(JSON.parse(raw));
      if (record) return record;
      storage.removeItem(STORAGE_KEYS.pendingTokenDeployment);
    } catch {
      // Try the next storage implementation.
    }
  }
  return null;
};

const saveRecord = ({
  status,
  transactionHash,
  user,
  userKey,
  issuerWallet,
  tokenUid,
  metadata = {},
}) => {
  const normalizedUserKey = text(userKey || getDeploymentUserKey(user)).toLowerCase();
  if (!normalizedUserKey) {
    throw new Error('The authenticated user could not be linked to the pending deployment.');
  }

  const existing = readStoredRecord();
  const now = Date.now();
  const record = normalizeRecord({
    version: PENDING_DEPLOYMENT_VERSION,
    status,
    transactionHash: assertValidTransactionHash(transactionHash),
    userKey: normalizedUserKey,
    chainId: Number(web3Config.requiredChain.id),
    network: web3Config.requiredChain.name,
    issuerWallet: normalizeAddress(issuerWallet),
    tokenUid: text(tokenUid || metadata.tokenUid),
    metadata: {
      ...(existing?.transactionHash?.toLowerCase() === String(transactionHash).toLowerCase()
        ? existing.metadata
        : {}),
      ...metadata,
    },
    createdAt:
      existing?.transactionHash?.toLowerCase() === String(transactionHash).toLowerCase()
        ? existing.createdAt
        : now,
    expiresAt: now + PENDING_DEPLOYMENT_TTL_MS,
  });

  if (!record) throw new Error('The pending deployment recovery record is invalid.');

  let saved = false;
  const serialized = JSON.stringify(record);
  getStorages().forEach((storage) => {
    try {
      storage.setItem(STORAGE_KEYS.pendingTokenDeployment, serialized);
      saved = true;
    } catch {
      // Continue so sessionStorage can be used when localStorage is unavailable, or vice versa.
    }
  });

  if (!saved) {
    throw new Error('This browser could not securely store the asset creation confirmation.');
  }

  return record;
};

export const pendingDeploymentService = Object.freeze({
  saveSubmitted(values) {
    return saveRecord({ ...values, status: 'submitted' });
  },

  saveConfirmed(values) {
    return saveRecord({ ...values, status: 'confirmed' });
  },

  get() {
    const record = readStoredRecord();
    if (!record) removeStoredRecord();
    return record;
  },

  getForUser(user) {
    const record = this.get();
    const userKey = getDeploymentUserKey(user);
    return record && userKey && record.userKey === userKey ? record : null;
  },

  belongsToAnotherUser(user) {
    const record = this.get();
    const userKey = getDeploymentUserKey(user);
    return Boolean(record && userKey && record.userKey !== userKey);
  },

  clear(transactionHash) {
    if (transactionHash) {
      const current = this.get();
      if (
        current &&
        current.transactionHash.toLowerCase() !==
          assertValidTransactionHash(transactionHash).toLowerCase()
      ) {
        return false;
      }
    }

    removeStoredRecord();
    return true;
  },
});
