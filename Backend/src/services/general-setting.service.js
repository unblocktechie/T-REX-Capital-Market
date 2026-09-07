const { CrudService } = require('./crud.service');
const { ApiError } = require('../core/errors/api-error');

const parseSettingValue = (value, type) => {
  if (type === 'number') return Number(value);
  if (type === 'boolean') return String(value).toLowerCase() === 'true';
  if (type === 'json') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
};

class GeneralSettingService extends CrudService {
  constructor(repository) { super(repository, 'General setting'); }

  validateValue(settingValue, valueType = 'string') {
    if (valueType === 'number' && (!String(settingValue).trim() || !Number.isFinite(Number(settingValue)))) {
      throw ApiError.badRequest('settingValue must contain a valid number for valueType number.');
    }
    if (valueType === 'boolean' && !['true', 'false'].includes(String(settingValue).toLowerCase())) {
      throw ApiError.badRequest('settingValue must be true or false for valueType boolean.');
    }
    if (valueType === 'json') {
      try { JSON.parse(settingValue); } catch { throw ApiError.badRequest('settingValue must contain valid JSON for valueType json.'); }
    }
  }

  async create(data) {
    this.validateValue(data.settingValue, data.valueType);
    return super.create(data);
  }

  async update(uid, data) {
    const current = await this.getByUid(uid);
    this.validateValue(data.settingValue ?? current.settingValue, data.valueType ?? current.valueType);
    return super.update(uid, data);
  }

  async listPublic() {
    const rows = await this.repository.listPublic();
    return rows.reduce((result, row) => {
      result[row.settingKey] = parseSettingValue(row.settingValue, row.valueType);
      return result;
    }, {});
  }
}

module.exports = { GeneralSettingService, parseSettingValue };
