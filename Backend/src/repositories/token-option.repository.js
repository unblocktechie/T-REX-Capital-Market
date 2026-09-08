const { execute } = require('../database/connection');

class TokenOptionRepository {
  async listClaimTopics(executor) {
    return execute(
      `SELECT \`claimTopicUid\`, \`claimTopicCode\`, \`claimTopicName\`, \`description\`, \`value\`
       FROM \`claimTopicMaster\`
       WHERE \`isActive\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`displayOrder\`, \`claimTopicName\``,
      [],
      executor,
    );
  }

  async findClaimTopics(claimTopicUids, executor) {
    if (!claimTopicUids.length) return [];
    return execute(
      `SELECT \`claimTopicUid\`, \`claimTopicCode\`, \`claimTopicName\`, \`description\`, \`value\`
       FROM \`claimTopicMaster\`
       WHERE \`claimTopicUid\` IN (${claimTopicUids.map(() => '?').join(', ')})
         AND \`isActive\` = 1 AND \`isDeleted\` = 0`,
      claimTopicUids,
      executor,
    );
  }

  async listAll() {
    return {
      decimals: [2, 6, 8, 18],
      countryRestrictionModes: ['allowlist', 'blocklist'],
      claimTopics: await this.listClaimTopics(),
    };
  }
}

module.exports = { TokenOptionRepository };
