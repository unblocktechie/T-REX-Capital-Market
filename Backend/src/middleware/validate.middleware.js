const { ApiError } = require('../core/errors/api-error');

const validate = (schemas) => (req, res, next) => {
  const errors = [];
  for (const location of ['params', 'query', 'body']) {
    if (!schemas[location]) continue;
    const { error, value } = schemas[location].validate(req[location], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      errors.push(...error.details.map((detail) => ({
        field: `${location}.${detail.path.join('.')}`,
        message: detail.message.replace(/\"/g, ''),
      })));
    } else {
      Object.defineProperty(req, location, { value, writable: true, configurable: true, enumerable: true });
    }
  }
  if (errors.length) return next(new ApiError(422, 'Request validation failed.', errors, 'VALIDATION_ERROR'));
  return next();
};

module.exports = { validate };
