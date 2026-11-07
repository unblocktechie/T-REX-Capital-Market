const { logger } = require('../services/common/log.service');

// Use the same repository lookup as TokenPriceRelay settings (no separate cache).
async function positiveSetting(repository, key, fallback, executor) {
  const row = await repository?.findByKey(key, executor);
  const raw = row?.settingValue;
  const value = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (row && row.isActive !== false && row.isActive !== 0 && Number.isSafeInteger(value) && value > 0) return value;
  logger.warn('Missing or invalid positive integer setting; using default', { settingKey: key, fallback });
  return fallback;
}

module.exports = { positiveSetting };
