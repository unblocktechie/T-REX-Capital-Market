const express = require('express');
const { health } = require('./v1/controllers/health.controller');
const { createV1Router } = require('./v1');

const createApiRouter = () => {
  const router = express.Router();
  router.get('/health', health);
  router.use('/v1', createV1Router());
  return router;
};

module.exports = { createApiRouter };
