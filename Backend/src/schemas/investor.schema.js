const { Joi, uid } = require('./common.schema');
const { INVESTMENT_CATEGORY_CODES } = require('../repositories/investor-option.repository');

const optionalText = (max) => Joi.string().trim().max(max).allow('', null);

const nameField = Joi.string()
  .trim()
  .max(50)
  .pattern(/^[\p{L}][\p{L}\s'’-]*$/u)
  .allow('', null)
  .messages({
    'string.pattern.base': '{{#label}} may contain letters, spaces, apostrophes, and hyphens only.',
  });

const optionalUid = uid.allow(null);

const identityDetails = Joi.object({
  firstName: nameField,
  lastName: nameField,
  dateOfBirth: Joi.date().iso().max('now').allow(null),
  gender: Joi.string().valid('male', 'female', 'other').allow('', null),
  streetAddress: optionalText(150),
  countryUid: optionalUid,
  stateUid: optionalUid,
  cityUid: optionalUid,
  isDraft: Joi.boolean().required(),
});

const compliance = Joi.object({
  sourceOfWealth: optionalText(120),
  estimatedNetWorth: optionalText(60),
  annualInvestmentCapacity: optionalText(60),
  investmentCategories: Joi.array().items(Joi.string().valid(...INVESTMENT_CATEGORY_CODES)).unique().max(10).default([]),
  yearsOfExperience: Joi.number().integer().min(0).max(80).allow(null),
  previousRwaExperience: Joi.string().valid('yes', 'no').allow('', null),
  rwaExperienceDescription: optionalText(600),
  accreditationType: Joi.string().valid('individual', 'institutional', 'qualified_professional').allow('', null),
  isDraft: Joi.boolean().required(),
});

const documentUpload = Joi.object({ documentTypeUid: uid.required() });
const documentParams = Joi.object({ documentUid: uid.required() });

const submitInvestor = Joi.object({});

module.exports = {
  identityDetails,
  compliance,
  documentUpload,
  documentParams,
  submitInvestor,
};
