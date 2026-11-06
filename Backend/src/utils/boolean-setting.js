const booleanSetting = async (repository, key, fallback = false, executor) => {
  const row = await repository?.findByKey(key, executor);
  if (!row || row.isActive === false || row.isActive === 0) return fallback;
  if ([true, 1, 'true', '1'].includes(row.settingValue)) return true;
  if ([false, 0, 'false', '0'].includes(row.settingValue)) return false;
  return fallback;
};
module.exports = { booleanSetting };
