const { CrudService } = require('./crud.service');
const { ApiError } = require('../core/errors/api-error');

class RoleService extends CrudService {
  constructor(repository, userRepository, permissionRepository) {
    super(repository, 'Role');
    this.userRepository = userRepository;
    this.permissionRepository = permissionRepository;
  }

  async update(uid, data) {
    const current = await this.getByUid(uid);
    if (current.isSystem && (data.isSystem === false || data.isActive === false)) {
      throw ApiError.forbidden('System roles cannot be disabled or converted to regular roles.');
    }
    return super.update(uid, data);
  }

  async delete(uid) {
    const current = await this.getByUid(uid);
    if (current.isSystem) throw ApiError.forbidden('System roles cannot be deleted.');
    if (await this.userRepository.countByRole(uid)) throw ApiError.conflict('This role is assigned to one or more users.');
    if (await this.permissionRepository.countByRole(uid)) throw ApiError.conflict('Delete this role\'s permissions before deleting the role.');
    return super.delete(uid);
  }
}

module.exports = { RoleService };
