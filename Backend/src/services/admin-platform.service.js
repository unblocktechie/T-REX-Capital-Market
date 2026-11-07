const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { positiveSetting } = require('../utils/positive-setting');
const { booleanSetting } = require('../utils/boolean-setting');
const { settings, apiKeySettings, notificationSettings } = require('../schemas/admin-platform.schema');
const { unknown } = require('./blockchain/token-holder-balance.service');
const STAGES = { pending: 'Investor documents pending', submitIntrest: 'Awaiting issuer review',
  verifiedByIssuer: 'Issuer verified; claim submission pending', claimSubmitted: 'Claim submitted; registry registration pending',
  registered: 'Registered', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
class AdminPlatformService {
  constructor({ repository, settingRepository, getInvestmentService, getPriceUpdateService, holderBalanceService, transactionRunner = withTransaction }) {
    Object.assign(this, { repository, settingRepository, getInvestmentService, getPriceUpdateService, holderBalanceService, transactionRunner });
  }
  async tokenPriceHistory(tokenUid, options) {
    const token = await this.repository.tokenDetails(tokenUid);
    if (!token) throw ApiError.notFound('Token was not found.');
    return this.getPriceUpdateService().historyForToken(token, options);
  }
  async tokenDetails(tokenUid, options) {
    const token = await this.repository.tokenDetails(tokenUid);
    if (!token) throw ApiError.notFound('Token was not found.');
    const { rows, holderSummary } = await this.tokenHolders(token, options);
    const selected = !options.holderStatus || options.holderStatus === 'all' ? rows
      : rows.filter(row => row.holderStatus === options.holderStatus.toUpperCase());
    if (options.sortBy) {
      const direction = options.sortOrder === 'asc' ? 1 : -1;
      selected.sort((a, b) => {
        const key = options.sortBy === 'currentTokenBalance' ? 'currentTokenBalanceRaw' : options.sortBy;
        const left = a[key]; const right = b[key];
        if (left == null && right != null) return 1;
        if (right == null && left != null) return -1;
        let compared = 0;
        if (left != null && right != null) {
          if (key === 'currentTokenBalanceRaw') compared = BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;
          else if (['createdAt','submittedAt'].includes(key)) compared = new Date(left) - new Date(right);
          else compared = String(left).localeCompare(String(right));
        }
        return direction * (compared || String(a.userUid).localeCompare(String(b.userUid)));
      });
    }
    const page = options.page || 1; const limit = options.limit || 20;
    return { token, investors: selected.slice((page - 1) * limit, page * limit), holderSummary,
      pagination: { page, limit, total: selected.length, totalPages: Math.ceil(selected.length / limit) } };
  }
  async tokenHolders(token, options = {}, verify = true) {
    const historical = await this.repository.tokenInvestors(token, options, { all: true });
    const balances = verify ? await this.holderBalanceService.balances(token, historical) : new Map();
    const rows = historical.map(row => ({ ...row,
      ...(balances.get((row.walletAddress || '').toLowerCase()) || unknown()) }));
    const holderSummary = { totalInvestors: rows.length, currentHolders: 0, formerHolders: 0, unknownHolders: 0 };
    for (const row of rows) {
      holderSummary[row.holderStatus === 'CURRENT' ? 'currentHolders' : row.holderStatus === 'FORMER' ? 'formerHolders' : 'unknownHolders']++;
    }
    return { rows, holderSummary };
  }
  async applicationHistory(interestUid, options = {}) {
    const service = this.getInvestmentService();
    const interest = await service.repository.findInterestByUid(interestUid);
    if (!interest) throw ApiError.notFound('Investment interest was not found.');
    const history = await service.assembleHistory(interest, documentUid =>
      `/api/v1/admin/investor-applications/${interestUid}/documents/${documentUid}/download`);
    if (options.sortBy) history.timeline.sort((a, b) => {
      const left = a[options.sortBy]; const right = b[options.sortBy];
      const compared = left == null ? (right == null ? 0 : -1) : right == null ? 1
        : options.sortBy === 'submissionNumber' ? Number(left) - Number(right)
          : options.sortBy === 'createdAt' ? new Date(left) - new Date(right) : String(left).localeCompare(String(right));
      return (options.sortOrder === 'asc' ? 1 : -1) * (compared || String(a.historyUid).localeCompare(String(b.historyUid)));
    });
    return { ...history, organizationName: interest.legalCompanyName ?? null };
  }
  async applicationDocument(interestUid, documentUid) {
    const service = this.getInvestmentService();
    const interest = await service.repository.findInterestByUid(interestUid);
    if (!interest) throw ApiError.notFound('Investment interest was not found.');
    return service.getSubmissionDocumentFile(interestUid, documentUid);
  }
  async keySettings() {
    const result = {};
    for (const [key, fallback] of Object.entries(settings)) result[key] = await (typeof fallback === 'boolean'
      ? booleanSetting(this.settingRepository, key, fallback) : positiveSetting(this.settingRepository, key, fallback));
    return result;
  }
  async updateKeySettings(input) {
    const { value, error } = apiKeySettings.validate(input);
    if (error) throw ApiError.badRequest(error.message);
    await this.transactionRunner(async (connection) => {
      const merged = { ...await this.keySettings(), ...value };
      if (merged.IssuerApiKeyAllowedIpsMin > merged.IssuerApiKeyAllowedIpsMax
        || merged.IssuerApiKeyCooldownMinSeconds > merged.IssuerApiKeyCooldownMaxSeconds) {
        throw ApiError.badRequest('Policy minimum limits must not exceed maximum limits.');
      }
      for (const [key, settingValue] of Object.entries(value)) {
        if (!await this.settingRepository.setValueByKey(key, settingValue, connection)) throw ApiError.conflict(`Setting ${key} is missing. Run migrations first.`);
      }
    });
    return this.keySettings();
  }
  async notifications() {
    const row = await this.settingRepository.findByKey('TeamNotificationEmails');
    let values;
    try { values = JSON.parse(row?.settingValue || '[]'); } catch { throw ApiError.conflict('TeamNotificationEmails contains invalid JSON.'); }
    const { value, error } = notificationSettings.validate({ teamNotificationEmails: values });
    if (error) throw ApiError.conflict('TeamNotificationEmails must contain valid email addresses.');
    return value;
  }
  async updateNotifications(input) {
    const { value, error } = notificationSettings.validate(input);
    if (error) throw ApiError.badRequest(error.message);
    if (!await this.settingRepository.setValueByKey('TeamNotificationEmails', JSON.stringify(value.teamNotificationEmails))) {
      throw ApiError.conflict('TeamNotificationEmails is missing. Run migrations first.');
    }
    return value;
  }
  async requireInvestor(userUid) {
    const investor = await this.repository.investor(userUid);
    if (!investor) throw ApiError.notFound('Investor account was not found.');
    return investor;
  }
  async list(kind, q, userUid) {
    const investor = userUid ? await this.requireInvestor(userUid) : null;
    let result;
    const holderSort = kind === 'tokens' && q.sortBy === 'currentHolders';
    if (kind === 'invested') result = await this.repository.tokens(q, investor);
    else if (kind === 'chains') result = await this.repository.chains(userUid, q);
    else if (kind === 'applications') result = await this.repository.applications(q, userUid);
    else if (holderSort) result = { rows: await this.repository.tokens(q, null, { all: true }) };
    else result = await this.repository[kind](q);
    if (kind === 'tokens') {
      // Limit parallel RPC work and bound fresh reads to one snapshot budget.
      // Token-list search must not filter the investors counted within each token.
      const deadline = Date.now() + 15000;
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(3, result.rows.length) }, async () => {
        while (cursor < result.rows.length) {
          const token = result.rows[cursor++];
          const { holderSummary } = await this.tokenHolders(token, {}, Date.now() < deadline);
          token.holderSummary = holderSummary;
        }
      }));
      if (holderSort) {
        const direction = q.sortOrder === 'asc' ? 1 : -1;
        result.rows.sort((a, b) => direction * (a.holderSummary.currentHolders - b.holderSummary.currentHolders
          || a.tokenUid.localeCompare(b.tokenUid)));
        const total = result.rows.length;
        const page = q.page || 1; const limit = q.limit || 20;
        result.rows = result.rows.slice((page - 1) * limit, page * limit);
        result.pagination = { page, limit, total, totalPages: Math.ceil(total / limit) };
      }
    }
    if (kind === 'applications') result.rows = result.rows.map(row => ({ ...row, stage: STAGES[row.status] || row.status, awaitingIssuerReview: row.status === 'submitIntrest' }));
    return result;
  }
}
module.exports = { AdminPlatformService, STAGES };
