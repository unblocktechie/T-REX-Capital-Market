const { execute } = require('../database/connection');

class TokenPriceApiRateLimitRepository {
  async consume(userUid, count, windowSeconds, executor) {
    await execute('DELETE FROM tokenPriceApiRequest WHERE userUid = ? AND createdAt <= TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(3))', [userUid, windowSeconds], executor);
    const [row] = await execute(`SELECT COUNT(*) AS used,
      CEIL(GREATEST(1, ? - TIMESTAMPDIFF(MICROSECOND, MIN(createdAt), UTC_TIMESTAMP(3)) / 1000000)) AS retryAfter
      FROM tokenPriceApiRequest WHERE userUid = ?`, [windowSeconds, userUid], executor);
    if (Number(row.used) >= count) return { allowed: false, retryAfter: Number(row.retryAfter) };
    await execute('INSERT INTO tokenPriceApiRequest (requestUid, userUid) VALUES (UUID(), ?)', [userUid], executor);
    return { allowed: true };
  }
}
module.exports = { TokenPriceApiRateLimitRepository };
