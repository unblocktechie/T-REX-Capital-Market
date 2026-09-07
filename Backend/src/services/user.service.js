const bcrypt = require('bcryptjs');
const { CrudService } = require('./crud.service');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');

class UserService extends CrudService {
  constructor(repository, roleRepository) {
    super(repository, 'User');
    this.roleRepository = roleRepository;
  }

  async create(data) {
    if (await this.repository.findByEmail(data.email)) throw ApiError.conflict('An account with this email already exists.');
    if (!await this.roleRepository.findByUid(data.roleUid)) throw ApiError.badRequest('The selected role does not exist.');
    const passwordHash = await bcrypt.hash(data.password, env.auth.bcryptRounds);
    const { password, ...record } = data;
    return this.repository.create({ ...record, passwordHash });
  }

  async update(uid, data) {
    const record = { ...data };
    if (record.email) {
      const existing = await this.repository.findByEmail(record.email);
      if (existing && existing.userUid !== uid) throw ApiError.conflict('An account with this email already exists.');
    }
    if (record.roleUid && !await this.roleRepository.findByUid(record.roleUid)) throw ApiError.badRequest('The selected role does not exist.');
    if (record.password) {
      record.passwordHash = await bcrypt.hash(record.password, env.auth.bcryptRounds);
      delete record.password;
    }
    return super.update(uid, record);
  }
}

module.exports = { UserService };
