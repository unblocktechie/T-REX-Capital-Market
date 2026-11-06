const { execute } = require('../database/connection');
const { sqlInteger } = require('../utils/sql');
const { orderBy } = require('../utils/admin-sort');

const INVESTOR_FROM = `FROM userMaster u INNER JOIN userRole r ON r.roleUid=u.roleUid AND r.isDeleted=0
  LEFT JOIN investorMaster i ON i.userUid=u.userUid AND i.isDeleted=0`;
const INVESTOR_FIELDS = `u.userUid,u.fullName,u.email,u.emailVerified,u.isActive,u.createdAt,
  i.investorUid,i.firstName,i.lastName,i.walletAddress,i.countryUid,i.accreditationType,
  i.status AS profileStatus,i.currentStep,i.isDraft,i.submittedAt`;
const TOKEN_FIELDS = `t.tokenUid,t.organizationUid,t.chainUid,c.chainId,c.chainName,t.tokenName,t.tokenSymbol,
  t.tokenAddress,t.decimals,CAST(t.initialTokenPrice AS CHAR) AS initialTokenPrice,
  CAST(t.currentTokenPrice AS CHAR) AS currentTokenPrice,t.status,t.paymentTokenAddress,t.deployedAt,
  t.createdAt,o.legalCompanyName`;
const TOKEN_FROM = `FROM tokenMaster t JOIN chainMaster c ON c.chainUid=t.chainUid AND c.isDeleted=0
  JOIN organizationMaster o ON o.organizationUid=t.organizationUid AND o.isDeleted=0`;
class AdminPlatformRepository {
  async tokenDetails(tokenUid) {
    const [token] = await execute(`SELECT ${TOKEN_FIELDS},t.deployedAt AS initialTokenPriceAt,
      COALESCE((SELECT p.confirmedAt FROM tokenPriceUpdate p
        WHERE p.tokenUid=t.tokenUid AND p.chainUid=t.chainUid AND p.isDeleted=0
          AND p.isCanonical=1 AND p.status='CONFIRMED' AND p.confirmedAt IS NOT NULL
          AND p.newPriceFormatted=t.currentTokenPrice
        ORDER BY p.blockNumber DESC,p.logIndex DESC,p.priceUpdateUid DESC LIMIT 1),
        CASE WHEN t.currentTokenPrice=t.initialTokenPrice OR t.currentTokenPrice IS NULL THEN t.deployedAt ELSE NULL END
      ) AS currentTokenPriceAt,t.tokenDescription,t.treasuryWalletAddress,
      t.maxInvestors,t.maxBalancePerInvestor,t.countryRestrictionMode,t.tokenAgentWalletAddress,
      t.identityManagerWalletAddress,t.identityRegistryAddress,t.identityRegistryStorageAddress,
      t.trustedIssuersRegistryAddress,t.claimTopicsRegistryAddress,t.modularComplianceAddress,
      t.deployTxHash,t.deployedAtBlock,t.currentStep,t.isDraft,t.isActive,t.updatedAt,
      t.imageStorageKey,t.imageOriginalFileName,t.imageMimeType,
      o.walletAddress AS issuerWalletAddress,o.userUid AS issuerUserUid
      ${TOKEN_FROM} WHERE t.tokenUid=? AND t.isDeleted=0`, [tokenUid]);
    return token || null;
  }
  tokenInvestors(token, q, { all = false } = {}) {
    const where = ["u.isDeleted=0", "r.roleName='Investor'", `(
      EXISTS (SELECT 1 FROM blockchainTransaction bt WHERE bt.tokenUid=? AND bt.chainUid=?
        AND bt.type='INVEST' AND bt.status='CONFIRMED' AND bt.isCanonical=1 AND bt.isDeleted=0 AND bt.isActive=1
        AND LOWER(bt.fromWallet)=LOWER(i.walletAddress))
      OR EXISTS (SELECT 1 FROM tokenPurchase p WHERE p.tokenUid=? AND p.investorUserUid=u.userUid
        AND p.status='COMPLETED' AND p.isDeleted=0))`];
    const params = [token.tokenUid, token.chainUid, token.tokenUid];
    if (q.search) {
      where.push('(u.fullName LIKE ? OR u.email LIKE ? OR i.walletAddress LIKE ?)');
      params.push(...Array(3).fill(`%${q.search}%`));
    }
    if (all) return execute(`SELECT ${INVESTOR_FIELDS} ${INVESTOR_FROM}
      WHERE ${where.join(' AND ')} ORDER BY u.createdAt DESC,u.userUid DESC`, params);
    return this.page(INVESTOR_FIELDS, INVESTOR_FROM, where, params, q, orderBy(q, {
      fullName: 'u.fullName', email: 'u.email', walletAddress: 'i.walletAddress', profileStatus: 'i.status',
      createdAt: 'u.createdAt', submittedAt: 'i.submittedAt', isActive: 'u.isActive',
    }, 'u.createdAt DESC,u.userUid DESC', 'u.userUid'));
  }
  async page(fields, from, where, params, options, order, executor) {
    const page = options.page || 1; const limit = options.limit || 20;
    const clause = where.join(' AND ');
    const [count] = await execute(`SELECT COUNT(*) AS total ${from} WHERE ${clause}`, params, executor);
    const rows = await execute(`SELECT ${fields} ${from} WHERE ${clause} ORDER BY ${order}
      LIMIT ${sqlInteger(limit, { min: 1, max: 100 })} OFFSET ${sqlInteger((page - 1) * limit)}`, params, executor);
    return { rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(Number(count.total) / limit) } };
  }
  async investor(userUid) {
    const rows = await execute(`SELECT ${INVESTOR_FIELDS} ${INVESTOR_FROM}
      WHERE u.userUid=? AND u.isDeleted=0 AND r.roleName='Investor'`, [userUid]);
    return rows[0] || null;
  }
  investors(q) {
    const where = ["u.isDeleted=0", "r.roleName='Investor'"]; const params = [];
    if (q.search) { where.push('(u.fullName LIKE ? OR u.email LIKE ? OR i.walletAddress LIKE ?)'); params.push(...Array(3).fill(`%${q.search}%`)); }
    if (q.status && q.status !== 'all') { where.push("COALESCE(i.status,'notStarted')=?"); params.push(q.status); }
    if (q.chainUid) { where.push('EXISTS (SELECT 1 FROM userChainIdentity ci WHERE ci.userUid=u.userUid AND ci.chainUid=? AND ci.isDeleted=0)'); params.push(q.chainUid); }
    return this.page(INVESTOR_FIELDS, INVESTOR_FROM, where, params, q, orderBy(q, {
      fullName: 'u.fullName', email: 'u.email', walletAddress: 'i.walletAddress', profileStatus: 'i.status',
      createdAt: 'u.createdAt', submittedAt: 'i.submittedAt', isActive: 'u.isActive',
    }, 'u.createdAt DESC,u.userUid DESC', 'u.userUid'));
  }
  chains(userUid, q) {
    const where = ['c.isDeleted=0']; const params = [userUid];
    if (q.chainUid) { where.push('c.chainUid=?'); params.push(q.chainUid); }
    if (q.search) { where.push('(c.chainName LIKE ? OR c.chainCode LIKE ?)'); params.push(`%${q.search}%`, `%${q.search}%`); }
    if (q.status && q.status !== 'all') { where.push("COALESCE(ci.status,'LOCKED')=?"); params.push(q.status); }
    return this.page(`c.chainUid,c.chainId,c.chainName,c.isActive AS chainActive,ci.walletAddress,ci.identityAddress,
      COALESCE(ci.status,'LOCKED') AS status,COALESCE(ci.isUnlocked,0) AS isUnlocked,ci.creationTxHash,ci.unlockedAt`,
    'FROM chainMaster c LEFT JOIN userChainIdentity ci ON ci.chainUid=c.chainUid AND ci.userUid=? AND ci.isDeleted=0',
    where, params, q, orderBy(q, { chainId: 'c.chainId', chainName: 'c.chainName', status: "COALESCE(ci.status,'LOCKED')",
      walletAddress: 'ci.walletAddress', identityAddress: 'ci.identityAddress', isUnlocked: 'ci.isUnlocked', unlockedAt: 'ci.unlockedAt',
    }, 'c.chainId,c.chainUid', 'c.chainUid'));
  }
  tokens(q, investor = null, { all = false } = {}) {
    const columns = { createdAt: 't.createdAt', deployedAt: 't.deployedAt', tokenName: 't.tokenName',
      tokenSymbol: 't.tokenSymbol', tokenAddress: 't.tokenAddress', status: 't.status', chainName: 'c.chainName',
      chainId: 'c.chainId', legalCompanyName: 'o.legalCompanyName', decimals: 't.decimals',
      initialTokenPrice: 't.initialTokenPrice', currentTokenPrice: 't.currentTokenPrice' };
    const column = Object.hasOwn(columns, q.sortBy) ? columns[q.sortBy] : columns.createdAt;
    const direction = String(q.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = ['t.isDeleted=0']; const params = [];
    for (const key of ['chainUid','organizationUid','tokenUid']) if (q[key]) { where.push(`t.${key}=?`); params.push(q[key]); }
    if (q.status && q.status !== 'all') { where.push('t.status=?'); params.push(q.status); }
    if (q.search) { where.push('(t.tokenName LIKE ? OR t.tokenSymbol LIKE ? OR t.tokenAddress LIKE ?)'); params.push(...Array(3).fill(`%${q.search}%`)); }
    if (investor) {
      where.push(`(EXISTS (SELECT 1 FROM blockchainTransaction bt WHERE bt.tokenUid=t.tokenUid AND bt.chainUid=t.chainUid
        AND bt.type='INVEST' AND bt.status='CONFIRMED' AND bt.isCanonical=1 AND bt.isDeleted=0 AND bt.isActive=1
        AND LOWER(bt.fromWallet)=LOWER(?)) OR EXISTS (SELECT 1 FROM tokenPurchase p
        WHERE p.tokenUid=t.tokenUid AND p.investorUserUid=? AND p.status='COMPLETED' AND p.isDeleted=0))`);
      params.push(investor.walletAddress || '', investor.userUid);
    }
    if (all) return execute(`SELECT ${TOKEN_FIELDS} ${TOKEN_FROM} WHERE ${where.join(' AND ')}
      ORDER BY ${column} ${direction},t.tokenUid ${direction}`, params);
    return this.page(TOKEN_FIELDS, TOKEN_FROM, where, params, q, `${column} ${direction},t.tokenUid ${direction}`);
  }
  applications(q, userUid = null) {
    const columns = { createdAt: 'a.createdAt', submittedAt: 'a.submittedAt', decisionAt: 'a.decisionAt',
      investorName: 'u.fullName', investorEmail: 'u.email', walletAddress: 'a.walletAddress', tokenAddress: 't.tokenAddress',
      tokenName: 't.tokenName', tokenSymbol: 't.tokenSymbol', issuerName: 'o.legalCompanyName',
      chainName: 'c.chainName', chainId: 'c.chainId', status: 'a.status' };
    const column = Object.hasOwn(columns, q.sortBy) ? columns[q.sortBy] : columns.createdAt;
    const direction = String(q.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = ['a.isDeleted=0','t.isDeleted=0','u.isDeleted=0','o.isDeleted=0','c.isDeleted=0']; const params = [];
    if (userUid) { where.push('a.investorUserUid=?'); params.push(userUid); }
    for (const key of ['chainUid','organizationUid','tokenUid']) if (q[key]) { where.push(`t.${key}=?`); params.push(q[key]); }
    if (q.pendingOnly) where.push("a.status='submitIntrest'");
    if (q.status && q.status !== 'all') { where.push('a.status=?'); params.push(q.status); }
    if (q.search) {
      where.push('(u.fullName LIKE ? OR u.email LIKE ? OR t.tokenName LIKE ? OR o.legalCompanyName LIKE ? OR LOWER(a.walletAddress)=LOWER(?) OR LOWER(t.tokenAddress)=LOWER(?))');
      params.push(...Array(4).fill(`%${q.search}%`), q.search, q.search);
    }
    return this.page(`a.interestUid,a.investorUid,a.investorUserUid,a.organizationUid,a.tokenUid,a.status,
      a.submittedAt,a.decisionAt,a.createdAt,a.note,a.rejectReason,a.canResubmitClaim,
      u.fullName AS investorName,u.email AS investorEmail,a.walletAddress,t.tokenAddress,t.tokenName,t.tokenSymbol,t.chainUid,
      c.chainName,c.chainId,o.legalCompanyName AS issuerName`,
    `FROM tokenInvestmentInterest a JOIN tokenMaster t ON t.tokenUid=a.tokenUid
      JOIN userMaster u ON u.userUid=a.investorUserUid JOIN organizationMaster o ON o.organizationUid=a.organizationUid
      JOIN chainMaster c ON c.chainUid=t.chainUid`, where, params, q, `${column} ${direction},a.interestUid ${direction}`);
  }
}
module.exports = { AdminPlatformRepository };
