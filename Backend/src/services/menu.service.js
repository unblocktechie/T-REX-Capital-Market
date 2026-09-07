const { CrudService } = require('./crud.service');
const { ApiError } = require('../core/errors/api-error');

class MenuService extends CrudService {
  constructor(repository, permissionRepository) {
    super(repository, 'Menu');
    this.permissionRepository = permissionRepository;
  }

  async validateParent(parentMenuUid, currentUid) {
    if (!parentMenuUid) return;
    if (parentMenuUid === currentUid) throw ApiError.badRequest('A menu cannot be its own parent.');
    if (!await this.repository.findByUid(parentMenuUid)) throw ApiError.badRequest('The parent menu does not exist.');
  }

  async create(data) {
    await this.validateParent(data.parentMenuUid);
    return super.create(data);
  }

  async update(uid, data) {
    await this.validateParent(data.parentMenuUid, uid);
    return super.update(uid, data);
  }

  async delete(uid) {
    await this.getByUid(uid);
    if (await this.repository.countChildren(uid)) throw ApiError.conflict('Move or delete child menus before deleting this menu.');
    if (await this.permissionRepository.countByMenu(uid)) throw ApiError.conflict('Delete permissions linked to this menu before deleting it.');
    return super.delete(uid);
  }
}

module.exports = { MenuService };
