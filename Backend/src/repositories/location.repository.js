const { execute } = require('../database/connection');

class LocationRepository {
  async paginate(sqlBase, countBase, params, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    const counts = await execute(countBase, params);
    const rows = await execute(`${sqlBase} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const total = Number(counts[0].total);
    return { rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async listCountries({ page = 1, limit = 50, search }) {
    const where = ['`isActive` = 1', '`isDeleted` = 0'];
    const params = [];
    if (search) {
      where.push('(`countryName` LIKE ? OR `countryCode` LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.join(' AND ');
    return this.paginate(
      `SELECT \`countryUid\`, \`countryCode\`, \`countryName\`, \`phoneCode\`, \`currencyCode\` FROM \`countryMaster\` WHERE ${clause} ORDER BY \`countryName\``,
      `SELECT COUNT(*) AS \`total\` FROM \`countryMaster\` WHERE ${clause}`,
      params,
      { page, limit },
    );
  }

  async listStates(countryUid, { page = 1, limit = 100, search }) {
    const where = ['`countryUid` = ?', '`isActive` = 1', '`isDeleted` = 0'];
    const params = [countryUid];
    if (search) {
      where.push('(`stateName` LIKE ? OR `stateCode` LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.join(' AND ');
    return this.paginate(
      `SELECT \`stateUid\`, \`countryUid\`, \`stateCode\`, \`stateName\` FROM \`stateMaster\` WHERE ${clause} ORDER BY \`stateName\``,
      `SELECT COUNT(*) AS \`total\` FROM \`stateMaster\` WHERE ${clause}`,
      params,
      { page, limit },
    );
  }

  async listCities(stateUid, { page = 1, limit = 100, search }) {
    const where = ['`stateUid` = ?', '`isActive` = 1', '`isDeleted` = 0'];
    const params = [stateUid];
    if (search) {
      where.push('`cityName` LIKE ?');
      params.push(`%${search}%`);
    }
    const clause = where.join(' AND ');
    return this.paginate(
      `SELECT \`cityUid\`, \`countryUid\`, \`stateUid\`, \`cityName\` FROM \`cityMaster\` WHERE ${clause} ORDER BY \`cityName\``,
      `SELECT COUNT(*) AS \`total\` FROM \`cityMaster\` WHERE ${clause}`,
      params,
      { page, limit },
    );
  }

  async findCountry(countryUid, executor) {
    const rows = await execute('SELECT * FROM `countryMaster` WHERE `countryUid` = ? AND `isActive` = 1 AND `isDeleted` = 0 LIMIT 1', [countryUid], executor);
    return rows[0] || null;
  }

  async findState(stateUid, executor) {
    const rows = await execute('SELECT * FROM `stateMaster` WHERE `stateUid` = ? AND `isActive` = 1 AND `isDeleted` = 0 LIMIT 1', [stateUid], executor);
    return rows[0] || null;
  }

  async findCity(cityUid, executor) {
    const rows = await execute('SELECT * FROM `cityMaster` WHERE `cityUid` = ? AND `isActive` = 1 AND `isDeleted` = 0 LIMIT 1', [cityUid], executor);
    return rows[0] || null;
  }
}

module.exports = { LocationRepository };
