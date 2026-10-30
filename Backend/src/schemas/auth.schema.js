const { Joi } = require('./common.schema');

const password = Joi.string()
  .min(8).max(72)
  .pattern(/[a-z]/, 'lowercase letter')
  .pattern(/[A-Z]/, 'uppercase letter')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special character');
const email = Joi.string().trim().lowercase().email().max(254);

const signup = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).required(),
  email: email.required(),
  password: password.required(),
  isIssuer: Joi.boolean().required(),
});
const login = Joi.object({ email: email.required(), password: Joi.string().max(72).required() });
const emailOnly = Joi.object({ email: email.required() });
const tokenQuery = Joi.object({ token: Joi.string().hex().length(64).required() });
const tokenBody = Joi.object({ token: Joi.string().hex().length(64).required() });
const resetPassword = Joi.object({ token: Joi.string().hex().length(64).required(), newPassword: password.required() });

module.exports = { signup, login, emailOnly, tokenQuery, tokenBody, resetPassword, password, email };
