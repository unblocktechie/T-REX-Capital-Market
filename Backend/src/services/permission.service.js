const { CrudService } = require('./crud.service');
const { ApiError } = require('../core/errors/api-error');

class PermissionService extends CrudService {
  constructor(repository, roleRepository, menuRepository) {
    super(repository, 'Permission');
    this.roleRepository = roleRepository;
    this.menuRepository = menuRepository;
  }

  async validateRelations(data) {
    if (data.roleUid && !await this.roleRepository.findByUid(data.roleUid)) throw ApiError.badRequest('The selected role does not exist.');
    if (data.menuUid && !await this.menuRepository.findByUid(data.menuUid)) throw ApiError.badRequest('The selected menu does not exist.');
  }

  async create(data) {
    await this.validateRelations(data);
    return super.create(data);
  }

  async update(uid, data) {
    await this.validateRelations(data);
    return super.update(uid, data);
  }
}

module.exports = { PermissionService };
