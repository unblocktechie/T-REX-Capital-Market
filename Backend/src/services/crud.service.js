const { ApiError } = require('../core/errors/api-error');

class CrudService {
  constructor(repository, resourceName) {
    this.repository = repository;
    this.resourceName = resourceName;
  }

  async create(data) { return this.repository.create(data); }

  async getByUid(uid) {
    const record = await this.repository.findByUid(uid);
    if (!record) throw ApiError.notFound(`${this.resourceName} was not found.`);
    return record;
  }

  async list(query) { return this.repository.list(query); }

  async update(uid, data) {
    const record = await this.repository.update(uid, data);
    if (!record) throw ApiError.notFound(`${this.resourceName} was not found.`);
    return record;
  }

  async delete(uid) {
    const deleted = await this.repository.softDelete(uid);
    if (!deleted) throw ApiError.notFound(`${this.resourceName} was not found.`);
  }
}

module.exports = { CrudService };
