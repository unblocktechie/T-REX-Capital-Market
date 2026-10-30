const ethers = require('ethers');
const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

const present = (row) => {
  if (!row) return null;
  const supportedActions = [];
  if (row.supportsPurchase) supportedActions.push('PURCHASE');
  if (row.supportsRedemption) supportedActions.push('REDEMPTION');
  return {
    paymentTokenUid: row.paymentTokenUid,
    chainUid: row.chainUid,
    paymentTokenCode: row.paymentTokenCode,
    name: row.paymentTokenName,
    symbol: row.paymentTokenSymbol,
    contractAddress: ethers.getAddress(row.contractAddress),
    decimals: Number(row.decimals),
    chainId: Number(row.chainId),
    networkName: row.networkName,
    explorerUrl: row.explorerUrl,
    imageUrl: row.imageStorageKey ? `/api/v1/payment-tokens/${row.paymentTokenUid}/image` : null,
    supportedActions,
    isDefault: Boolean(row.isDefault),
    displayOrder: Number(row.displayOrder || 0),
    isActive: Boolean(row.isActive),
    imageOriginalFileName: row.imageOriginalFileName || null,
    imageMimeType: row.imageMimeType || null,
    imageFileSize: row.imageFileSize == null ? null : Number(row.imageFileSize),
    imageWidth: row.imageWidth == null ? null : Number(row.imageWidth),
    imageHeight: row.imageHeight == null ? null : Number(row.imageHeight),
    imageChecksumSha256: row.imageChecksumSha256 || null,
    imageVirusScanStatus: row.imageVirusScanStatus || null,
  };
};

const actionClause = (action) => {
  const normalized = action ? String(action).toUpperCase() : null;
  if (normalized === 'PURCHASE') return ' AND `supportsPurchase` = 1';
  if (normalized === 'REDEMPTION') return ' AND `supportsRedemption` = 1';
  return '';
};

class PaymentTokenRepository {
  async listActive(chainId = null, action = null, executor) {
    const params = [];
    let chainClause = '';
    if (chainId !== null && chainId !== undefined) {
      chainClause = ' AND `chainId` = ?';
      params.push(Number(chainId));
    }
    const rows = await execute(
      `SELECT *
       FROM \`paymentTokenMaster\`
       WHERE \`isActive\` = 1 AND \`isDeleted\` = 0
         ${chainClause}${actionClause(action)}
       ORDER BY \`isDefault\` DESC, \`displayOrder\`, \`paymentTokenName\``,
      params,
      executor,
    );
    return rows.map(present);
  }

  async listActiveByChainUid(chainUid, action = null, executor) {
    const rows = await execute(
      `SELECT * FROM \`paymentTokenMaster\`
       WHERE \`chainUid\` = ? AND \`isActive\` = 1 AND \`isDeleted\` = 0
         ${actionClause(action)}
       ORDER BY \`isDefault\` DESC, \`displayOrder\`, \`paymentTokenName\``,
      [chainUid], executor,
    );
    return rows.map(present);
  }

  async findActiveByAddress(contractAddress, chainId = null, action = null, executor) {
    if (!ethers.isAddress(contractAddress || '')) return null;
    const params = [String(contractAddress).toLowerCase()];
    let chainClause = '';
    if (chainId !== null && chainId !== undefined) {
      chainClause = ' AND `chainId` = ?';
      params.push(Number(chainId));
    }
    const rows = await execute(
      `SELECT *
       FROM \`paymentTokenMaster\`
       WHERE LOWER(\`contractAddress\`) = ?
         AND \`isActive\` = 1 AND \`isDeleted\` = 0
         ${chainClause}${actionClause(action)}
       LIMIT 1`,
      params,
      executor,
    );
    return present(rows[0]);
  }

  async findDefault(chainId, action = null, executor) {
    const rows = await execute(
      `SELECT *
       FROM \`paymentTokenMaster\`
       WHERE \`chainId\` = ? AND \`isDefault\` = 1
         AND \`isActive\` = 1 AND \`isDeleted\` = 0
         ${actionClause(action)}
       ORDER BY \`displayOrder\`, \`paymentTokenName\`
       LIMIT 1`,
      [Number(chainId)],
      executor,
    );
    return present(rows[0]);
  }

  async findRawByUid(paymentTokenUid, executor) {
    const rows = await execute(
      `SELECT p.*, c.\`chainName\`, c.\`chainCode\`
       FROM \`paymentTokenMaster\` p
       INNER JOIN \`chainMaster\` c ON c.\`chainUid\` = p.\`chainUid\` AND c.\`isDeleted\` = 0
       WHERE p.\`paymentTokenUid\` = ? AND p.\`isDeleted\` = 0 LIMIT 1`,
      [paymentTokenUid], executor,
    );
    return rows[0] || null;
  }

  async findByUid(paymentTokenUid, executor) {
    const row = await this.findRawByUid(paymentTokenUid, executor);
    if (!row) return null;
    return { ...present(row), chainName: row.chainName, chainCode: row.chainCode };
  }

  async listAdmin(options = {}, executor) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const conditions = ['p.`isDeleted` = 0'];
    const params = [];
    if (options.chainUid) { conditions.push('p.`chainUid` = ?'); params.push(options.chainUid); }
    if (options.isActive !== undefined) { conditions.push('p.`isActive` = ?'); params.push(Boolean(options.isActive)); }
    if (options.search) {
      conditions.push('(p.`paymentTokenCode` LIKE ? OR p.`paymentTokenName` LIKE ? OR p.`paymentTokenSymbol` LIKE ? OR p.`contractAddress` LIKE ?)');
      for (let index = 0; index < 4; index += 1) params.push(`%${options.search}%`);
    }
    const where = conditions.join(' AND ');
    const count = await execute(`SELECT COUNT(*) AS \`total\` FROM \`paymentTokenMaster\` p WHERE ${where}`, params, executor);
    const rows = await execute(
      `SELECT p.*, c.\`chainName\`, c.\`chainCode\`
       FROM \`paymentTokenMaster\` p
       INNER JOIN \`chainMaster\` c ON c.\`chainUid\` = p.\`chainUid\` AND c.\`isDeleted\` = 0
       WHERE ${where}
       ORDER BY c.\`displayOrder\`, p.\`isDefault\` DESC, p.\`displayOrder\`, p.\`paymentTokenName\`
       LIMIT ${sqlInteger(limit, { min: 1, name: 'limit' })} OFFSET ${sqlInteger(offset, { name: 'offset' })}`,
      params, executor,
    );
    const total = Number(count[0].total);
    return {
      rows: rows.map((row) => ({ ...present(row), chainName: row.chainName, chainCode: row.chainCode })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data, executor) {
    const paymentTokenUid = createUid();
    await execute(
      `INSERT INTO \`paymentTokenMaster\`
       (\`paymentTokenUid\`,\`chainUid\`,\`paymentTokenCode\`,\`paymentTokenName\`,\`paymentTokenSymbol\`,
        \`contractAddress\`,\`decimals\`,\`chainId\`,\`networkName\`,\`explorerUrl\`,
        \`supportsPurchase\`,\`supportsRedemption\`,\`isDefault\`,\`displayOrder\`,\`isActive\`,
        \`imageOriginalFileName\`,\`imageStorageKey\`,\`imageMimeType\`,\`imageFileSize\`,\`imageWidth\`,
        \`imageHeight\`,\`imageChecksumSha256\`,\`imageVirusScanStatus\`)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [paymentTokenUid, data.chainUid, data.paymentTokenCode, data.paymentTokenName, data.paymentTokenSymbol,
        data.contractAddress, data.decimals, data.chainId, data.networkName, data.explorerUrl || null,
        data.supportsPurchase, data.supportsRedemption, data.isDefault, data.displayOrder, data.isActive,
        data.imageOriginalFileName || null, data.imageStorageKey || null, data.imageMimeType || null,
        data.imageFileSize || null, data.imageWidth || null, data.imageHeight || null,
        data.imageChecksumSha256 || null, data.imageVirusScanStatus || null], executor,
    );
    return this.findByUid(paymentTokenUid, executor);
  }

  async update(paymentTokenUid, data, executor) {
    const allowed = new Set([
      'chainUid', 'paymentTokenCode', 'paymentTokenName', 'paymentTokenSymbol', 'contractAddress',
      'decimals', 'chainId', 'networkName', 'explorerUrl', 'isDefault', 'displayOrder', 'isActive',
      'isDeleted', 'imageOriginalFileName', 'imageStorageKey', 'imageMimeType', 'imageFileSize',
      'imageWidth', 'imageHeight', 'imageChecksumSha256', 'imageVirusScanStatus',
    ]);
    const entries = Object.entries(data).filter(([field, value]) => allowed.has(field) && value !== undefined);
    if (entries.length) {
      await execute(
        `UPDATE \`paymentTokenMaster\` SET ${entries.map(([field]) => `\`${field}\` = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
         WHERE \`paymentTokenUid\` = ? AND \`isDeleted\` = 0`,
        [...entries.map(([, value]) => value), paymentTokenUid], executor,
      );
    }
    return this.findByUid(paymentTokenUid, executor);
  }

  async clearDefault(chainUid, exceptUid, executor) {
    await execute(
      `UPDATE \`paymentTokenMaster\` SET \`isDefault\` = 0, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`chainUid\` = ? AND \`paymentTokenUid\` <> ? AND \`isDeleted\` = 0`,
      [chainUid, exceptUid], executor,
    );
  }

  async dependencyCounts(paymentTokenUid, executor) {
    const token = await this.findByUid(paymentTokenUid, executor);
    if (!token) return { configuredTokens: 0, transactions: 0 };
    const rows = await execute(
      `SELECT
        (SELECT COUNT(*) FROM \`tokenMaster\`
         WHERE \`chainUid\` = ? AND LOWER(\`paymentTokenAddress\`) = LOWER(?) AND \`isDeleted\` = 0) AS \`configuredTokens\`,
        (SELECT COUNT(*) FROM \`blockchainTransaction\`
         WHERE \`chainUid\` = ? AND LOWER(\`paymentTokenAddress\`) = LOWER(?)) AS \`transactions\``,
      [token.chainUid, token.contractAddress, token.chainUid, token.contractAddress], executor,
    );
    return rows[0];
  }
}

module.exports = { PaymentTokenRepository, presentPaymentToken: present };
