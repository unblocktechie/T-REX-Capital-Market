const { withTransaction } = require('../database/connection');
const { positiveSetting } = require('../utils/positive-setting');

class TokenPriceApiRateLimitService {
  constructor({ repository, ownerRepository, settingRepository, transactionRunner = withTransaction }) {
    Object.assign(this, { repository, ownerRepository, settingRepository, transactionRunner });
  }

  consume(userUid) {
    return this.transactionRunner(async (connection) => {
      // Same issuer lock as key creation/rotation: shared across keys, chains and instances.
      await this.ownerRepository.lockOwner(userUid, connection);
      const count = await positiveSetting(this.settingRepository, 'TokenPriceApiReadRateLimitCount', 60, connection);
      const windowSeconds = await positiveSetting(this.settingRepository, 'TokenPriceApiReadRateLimitWindowSeconds', 60, connection);
      return this.repository.consume(userUid, count, windowSeconds, connection);
    });
  }
}
module.exports = { TokenPriceApiRateLimitService };
