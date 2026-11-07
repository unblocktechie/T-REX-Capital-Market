const { Joi } = require('./common.schema');
const percent = Joi.string().pattern(/^(?:\d{1,3})(?:\.\d{1,2})?$/).custom((value, helpers) =>
  Number(value) > 0 && Number(value) <= 100 ? value : helpers.error('any.invalid')).allow(null);
const time = Joi.string().pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/).allow(null);
const policyFields = {
  threshold: percent,
  maxCumulative24hPercent: percent,
  cooldownSeconds: Joi.string().pattern(/^[1-9]\d*$/).allow(null),
  frequency: Joi.string().valid('hourly', 'daily', 'weekly', 'monthly').allow(null),
  allowedDays: Joi.array().items(Joi.string().valid('Mon','Tue','Wed','Thu','Fri','Sat','Sun')).unique().min(1).max(7).allow(null),
  startTime: time, endTime: time,
  timezone: Joi.string().empty(null).default('UTC').max(100).custom((value, helpers) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return value; } catch { return helpers.error('any.invalid'); }
  }),
  allowedIps: Joi.array().items(Joi.string().ip({ version: ['ipv4','ipv6'], cidr: 'forbidden' })).unique().required(),
};
const policy = Joi.object(policyFields).custom((value, helpers) => {
  if (Boolean(value.startTime) !== Boolean(value.endTime)) return helpers.message('startTime and endTime must be supplied together');
  if (value.startTime && value.endTime === value.startTime) return helpers.message('startTime and endTime must be different');
  return value;
});
module.exports = { policy, policyFields };
