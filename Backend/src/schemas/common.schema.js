const Joi = require('joi');

const uid = Joi.string().guid();
const booleanQuery = Joi.boolean().truthy('1').falsy('0');
const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100),
  sortBy: Joi.string().trim().max(50).default('createdAt'),
  sortOrder: Joi.string().lowercase().valid('asc', 'desc').default('desc'),
});

const uidParams = (key) => Joi.object({ [key]: uid.required() });

module.exports = { Joi, uid, booleanQuery, listQuery, uidParams };
