const { env } = require('../../../core/config/env');
const { sendSuccess } = require('../../../utils/response');

const health = (req, res) => sendSuccess(req, res, {
  message: 'T-REX Capital Market API is healthy.',
  data: {
    status: 'UP',
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    environment: env.nodeEnv,
    utcTimestamp: new Date().toISOString(),
    version: env.appVersion,
  },
});

module.exports = { health };
