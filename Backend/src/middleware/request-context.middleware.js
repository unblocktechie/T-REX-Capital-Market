const crypto = require('node:crypto');

const requestContext = (req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

module.exports = { requestContext };
