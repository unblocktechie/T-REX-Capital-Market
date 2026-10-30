const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const present = (row, { admin = false } = {}) => {
  if (!row) return null;
  const item = {
    chainUid: row.chainUid,
    chainCode: row.chainCode,
    chainName: row.chainName,
    chainId: Number(row.chainId),
    networkName: row.networkName,
    nativeCurrencyName: row.nativeCurrencyName,
    nativeCurrencySymbol: row.nativeCurrencySymbol,
    nativeCurrencyDecimals: Number(row.nativeCurrencyDecimals),
    publicRpcUrl: row.publicRpcUrl || null,
    explorerUrl: row.explorerUrl || null,
    imageUrl: row.imageStorageKey ? `/api/v1/chains/${row.chainUid}/image` : null,
    contractSuiteDeployedAt: row.contractSuiteDeployedAt || null,
    trexImplementationAuthorityAddress: row.trexImplementationAuthorityAddress,
    trexGatewayAddress: row.trexGatewayAddress,
    identityImplementationAuthorityAddress: row.identityImplementationAuthorityAddress,
    identityFactoryAddress: row.identityFactoryAddress,
    platformControllerAddress: row.platformControllerAddress,
    trexFactoryAddress: row.trexFactoryAddress,
    countryRestrictModuleAddress: row.countryRestrictModuleAddress,
    maxBalanceModuleAddress: row.maxBalanceModuleAddress,
    maxInvestorsModuleAddress: row.maxInvestorsModuleAddress,
    platformControllerOwnerAddress: row.platformControllerOwnerAddress,
    idFactoryAccessManagerAddress: row.idFactoryAccessManagerAddress || null,
    idFactoryAccessManagerAdminAddress: row.idFactoryAccessManagerAdminAddress || null,
    tokenImplementationAddress: row.tokenImplementationAddress,
    claimTopicsRegistryImplementationAddress: row.claimTopicsRegistryImplementationAddress,
    identityRegistryImplementationAddress: row.identityRegistryImplementationAddress,
    identityRegistryStorageImplementationAddress: row.identityRegistryStorageImplementationAddress,
    trustedIssuersRegistryImplementationAddress: row.trustedIssuersRegistryImplementationAddress,
    modularComplianceImplementationAddress: row.modularComplianceImplementationAddress,
    identityImplementationAddress: row.identityImplementationAddress,
    deployerAddress: row.deployerAddress,
    confirmations: Number(row.confirmations),
    registryConfirmations: Number(row.registryConfirmations),
    deploymentStartBlock: Number(row.deploymentStartBlock || 0),
    claimIndexerStartBlock: Number(row.claimIndexerStartBlock || 0),
    registryIndexerStartBlock: Number(row.registryIndexerStartBlock || 0),
    transactionIndexerStartBlock: Number(row.transactionIndexerStartBlock || 0),
    delegationManagerAddresses: parseJsonArray(row.delegationManagerAddresses),
    isTestnet: Boolean(row.isTestnet),
    isDefault: Boolean(row.isDefault),
    displayOrder: Number(row.displayOrder || 0),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (admin) {
    item.hasRpcUrl = Boolean(row.rpcUrl);
    item.fallbackRpcCount = parseJsonArray(row.fallbackRpcUrls).length;
    item.hasDeployerPrivateKey = Boolean(row.deployerPrivateKeyEncrypted);
    item.transactionTimeoutMs = Number(row.transactionTimeoutMs);
    item.deploymentAttemptTtlMinutes = Number(row.deploymentAttemptTtlMinutes);
    item.registryRecoveryLookbackBlocks = Number(row.registryRecoveryLookbackBlocks);
    item.registryRecoveryBlockOffset = Number(row.registryRecoveryBlockOffset);
    item.reconcileBlockOffset = Number(row.reconcileBlockOffset);
    item.reconcileMaxLookbackBlocks = Number(row.reconcileMaxLookbackBlocks);
    item.indexersEnabled = Boolean(row.indexersEnabled);
    item.imageOriginalFileName = row.imageOriginalFileName || null;
    item.imageMimeType = row.imageMimeType || null;
    item.imageFileSize = row.imageFileSize == null ? null : Number(row.imageFileSize);
    item.imageWidth = row.imageWidth == null ? null : Number(row.imageWidth);
    item.imageHeight = row.imageHeight == null ? null : Number(row.imageHeight);
    item.imageChecksumSha256 = row.imageChecksumSha256 || null;
    item.imageVirusScanStatus = row.imageVirusScanStatus || null;
  }
  return item;
};

const writableFields = new Set([
  'chainCode', 'chainName', 'chainId', 'networkName', 'nativeCurrencyName',
  'nativeCurrencySymbol', 'nativeCurrencyDecimals', 'rpcUrl', 'fallbackRpcUrls', 'publicRpcUrl',
  'explorerUrl', 'contractSuiteDeployedAt', 'trexImplementationAuthorityAddress',
  'trexGatewayAddress', 'identityImplementationAuthorityAddress', 'identityFactoryAddress',
  'platformControllerAddress', 'trexFactoryAddress', 'countryRestrictModuleAddress',
  'maxBalanceModuleAddress', 'maxInvestorsModuleAddress', 'platformControllerOwnerAddress',
  'idFactoryAccessManagerAddress', 'idFactoryAccessManagerAdminAddress',
  'tokenImplementationAddress', 'claimTopicsRegistryImplementationAddress',
  'identityRegistryImplementationAddress', 'identityRegistryStorageImplementationAddress',
  'trustedIssuersRegistryImplementationAddress', 'modularComplianceImplementationAddress',
  'identityImplementationAddress',
  'deployerAddress', 'deployerPrivateKeyEncrypted', 'confirmations', 'registryConfirmations',
  'transactionTimeoutMs', 'deploymentStartBlock', 'claimIndexerStartBlock',
  'registryIndexerStartBlock', 'transactionIndexerStartBlock', 'registryRecoveryLookbackBlocks',
  'registryRecoveryBlockOffset', 'reconcileBlockOffset', 'reconcileMaxLookbackBlocks',
  'deploymentAttemptTtlMinutes', 'delegationManagerAddresses', 'indexersEnabled', 'isTestnet',
  'isDefault', 'displayOrder', 'isActive', 'isDeleted', 'imageOriginalFileName', 'imageStorageKey',
  'imageMimeType', 'imageFileSize', 'imageWidth', 'imageHeight', 'imageChecksumSha256',
  'imageVirusScanStatus',
]);

const databaseValue = (field, value) => {
  if (['fallbackRpcUrls', 'delegationManagerAddresses'].includes(field)) return JSON.stringify(value || []);
  return value;
};

class ChainRepository {
  async listActive(executor) {
    const rows = await execute(
      `SELECT * FROM \`chainMaster\`
       WHERE \`isActive\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`isDefault\` DESC, \`displayOrder\`, \`chainName\``,
      [], executor,
    );
    return rows.map((row) => present(row));
  }

  async listAdmin(options = {}, executor) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const conditions = ['`isDeleted` = 0'];
    const params = [];
    if (options.search) {
      conditions.push('(\`chainCode\` LIKE ? OR \`chainName\` LIKE ? OR \`networkName\` LIKE ? OR CAST(\`chainId\` AS CHAR) LIKE ?)');
      for (let index = 0; index < 4; index += 1) params.push(`%${options.search}%`);
    }
    if (options.isActive !== undefined) {
      conditions.push('`isActive` = ?');
      params.push(Boolean(options.isActive));
    }
    const where = conditions.join(' AND ');
    const count = await execute(`SELECT COUNT(*) AS \`total\` FROM \`chainMaster\` WHERE ${where}`, params, executor);
    const rows = await execute(
      `SELECT * FROM \`chainMaster\` WHERE ${where}
       ORDER BY \`isDefault\` DESC, \`displayOrder\`, \`chainName\`
       LIMIT ${sqlInteger(limit, { min: 1, name: 'limit' })}
       OFFSET ${sqlInteger(offset, { name: 'offset' })}`,
      params, executor,
    );
    const total = Number(count[0].total);
    return { rows: rows.map((row) => present(row, { admin: true })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findRawByUid(chainUid, executor) {
    const rows = await execute('SELECT * FROM `chainMaster` WHERE `chainUid` = ? AND `isDeleted` = 0 LIMIT 1', [chainUid], executor);
    return rows[0] || null;
  }

  async findByUid(chainUid, executor, options = {}) {
    return present(await this.findRawByUid(chainUid, executor), options);
  }

  async findRawByChainId(chainId, executor) {
    const rows = await execute('SELECT * FROM `chainMaster` WHERE `chainId` = ? AND `isDeleted` = 0 LIMIT 1', [Number(chainId)], executor);
    return rows[0] || null;
  }

  async findByChainId(chainId, executor, options = {}) {
    return present(await this.findRawByChainId(chainId, executor), options);
  }

  async findDefault(executor) {
    const rows = await execute(
      'SELECT * FROM `chainMaster` WHERE `isActive` = 1 AND `isDeleted` = 0 ORDER BY `isDefault` DESC, `displayOrder`, `createdAt` LIMIT 1',
      [], executor,
    );
    return present(rows[0]);
  }

  async create(data, executor) {
    const chainUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => writableFields.has(field) && value !== undefined);
    const columns = ['`chainUid`', ...entries.map(([field]) => `\`${field}\``)];
    await execute(
      `INSERT INTO \`chainMaster\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [chainUid, ...entries.map(([field, value]) => databaseValue(field, value))], executor,
    );
    return this.findByUid(chainUid, executor, { admin: true });
  }

  async update(chainUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => writableFields.has(field) && value !== undefined);
    if (entries.length) {
      await execute(
        `UPDATE \`chainMaster\` SET ${entries.map(([field]) => `\`${field}\` = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
         WHERE \`chainUid\` = ? AND \`isDeleted\` = 0`,
        [...entries.map(([field, value]) => databaseValue(field, value)), chainUid], executor,
      );
    }
    return this.findByUid(chainUid, executor, { admin: true });
  }

  async clearDefault(exceptChainUid, executor) {
    await execute(
      'UPDATE `chainMaster` SET `isDefault` = 0, `updatedAt` = UTC_TIMESTAMP(3) WHERE `chainUid` <> ? AND `isDeleted` = 0',
      [exceptChainUid], executor,
    );
  }

  async dependencyCounts(chainUid, executor) {
    const rows = await execute(
      `SELECT
        (SELECT COUNT(*) FROM \`paymentTokenMaster\` WHERE \`chainUid\` = ? AND \`isDeleted\` = 0) AS \`paymentTokens\`,
        (SELECT COUNT(*) FROM \`tokenMaster\` WHERE \`chainUid\` = ? AND \`isDeleted\` = 0) AS \`tokens\`,
        (SELECT COUNT(*) FROM \`userChainIdentity\` WHERE \`chainUid\` = ? AND \`isDeleted\` = 0) AS \`identities\``,
      [chainUid, chainUid, chainUid], executor,
    );
    return rows[0];
  }

  async softDelete(chainUid, executor) {
    const result = await execute(
      'UPDATE `chainMaster` SET `isDeleted` = 1, `isActive` = 0, `isDefault` = 0, `updatedAt` = UTC_TIMESTAMP(3) WHERE `chainUid` = ? AND `isDeleted` = 0',
      [chainUid], executor,
    );
    return result.affectedRows > 0;
  }
}

module.exports = { ChainRepository, presentChain: present, parseJsonArray };
