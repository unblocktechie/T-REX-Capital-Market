const mysql = require('mysql2/promise');
const { env } = require('../core/config/env');

let pool;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
      waitForConnections: true,
      connectionLimit: env.database.connectionLimit,
      queueLimit: 0,
      timezone: 'Z',
      charset: 'utf8mb4',
      decimalNumbers: true,
      dateStrings: false,
      typeCast(field, next) {
        if (field.type === 'TINY' && field.length === 1) return field.string() === '1';
        return next();
      },
    });
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
};

const execute = async (sql, params = [], executor = getPool()) => {
  const [rows] = await executor.execute(sql, params);
  return rows;
};

const withTransaction = async (work) => {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const pingDatabase = async () => {
  await execute('SELECT 1 AS healthy');
  return true;
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
};

module.exports = { getPool, execute, withTransaction, pingDatabase, closePool };
