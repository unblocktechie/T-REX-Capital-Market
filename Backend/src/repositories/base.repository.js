const { execute } = require('../database/connection');
const { ApiError } = require('../core/errors/api-error');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

const identifier = (value) => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
};

class BaseRepository {
  constructor({ table, uidColumn, selectColumns = ['*'], searchColumns = [], sortableColumns = [], filterableColumns = [] }) {
    this.table = table;
    this.uidColumn = uidColumn;
    this.selectColumns = selectColumns;
    this.searchColumns = searchColumns;
    this.sortableColumns = sortableColumns;
    this.filterableColumns = filterableColumns;
  }

  get selectSql() {
    return this.selectColumns[0] === '*' ? '*' : this.selectColumns.map(identifier).join(', ');
  }

  async findByUid(uid, executor) {
    const rows = await execute(
      `SELECT ${this.selectSql} FROM ${identifier(this.table)} WHERE ${identifier(this.uidColumn)} = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [uid],
      executor,
    );
    return rows[0] || null;
  }

  async list(options = {}, executor) {
    const page = Math.max(1, Math.trunc(Number(options.page) || 1));
    const limit = Math.max(1, Math.trunc(Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const limitSql = sqlInteger(limit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const conditions = ['`isDeleted` = 0'];
    const params = [];

    if (options.search && this.searchColumns.length) {
      conditions.push(`(${this.searchColumns.map((column) => `${identifier(column)} LIKE ?`).join(' OR ')})`);
      this.searchColumns.forEach(() => params.push(`%${options.search}%`));
    }

    for (const column of this.filterableColumns) {
      if (options[column] !== undefined) {
        conditions.push(`${identifier(column)} = ?`);
        params.push(options[column]);
      }
    }

    const sortBy = this.sortableColumns.includes(options.sortBy) ? options.sortBy : 'createdAt';
    const sortOrder = String(options.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = conditions.join(' AND ');
    const countRows = await execute(`SELECT COUNT(*) AS total FROM ${identifier(this.table)} WHERE ${where}`, params, executor);
    const rows = await execute(
      `SELECT ${this.selectSql} FROM ${identifier(this.table)} WHERE ${where} ORDER BY ${identifier(sortBy)} ${sortOrder} LIMIT ${limitSql} OFFSET ${offsetSql}`,
      params,
      executor,
    );
    const total = Number(countRows[0].total);
    return { rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async create(data, executor) {
    const record = { [this.uidColumn]: data[this.uidColumn] || createUid(), ...data };
    const entries = Object.entries(record).filter(([, value]) => value !== undefined);
    const columns = entries.map(([column]) => identifier(column)).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    await execute(
      `INSERT INTO ${identifier(this.table)} (${columns}) VALUES (${placeholders})`,
      entries.map(([, value]) => value),
      executor,
    );
    return this.findByUid(record[this.uidColumn], executor);
  }

  async update(uid, data, executor) {
    const entries = Object.entries(data).filter(([column, value]) => column !== this.uidColumn && value !== undefined);
    if (!entries.length) throw ApiError.badRequest('No fields were provided for update.');
    const assignments = entries.map(([column]) => `${identifier(column)} = ?`).join(', ');
    const result = await execute(
      `UPDATE ${identifier(this.table)} SET ${assignments}, \`updatedAt\` = UTC_TIMESTAMP(3) WHERE ${identifier(this.uidColumn)} = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), uid],
      executor,
    );
    if (!result.affectedRows) return null;
    return this.findByUid(uid, executor);
  }

  async softDelete(uid, executor) {
    const result = await execute(
      `UPDATE ${identifier(this.table)} SET \`isDeleted\` = 1, \`isActive\` = 0, \`updatedAt\` = UTC_TIMESTAMP(3) WHERE ${identifier(this.uidColumn)} = ? AND \`isDeleted\` = 0`,
      [uid],
      executor,
    );
    return result.affectedRows > 0;
  }
}

module.exports = { BaseRepository, identifier };
