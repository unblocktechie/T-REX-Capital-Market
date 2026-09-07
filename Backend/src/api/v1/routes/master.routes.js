const express = require('express');
const { createCrudRouter } = require('./crud.routes');
const masterSchemas = require('../../../schemas/master.schema');
const { asyncHandler } = require('../../../utils/async-handler');
const { sendSuccess } = require('../../../utils/response');

const createMasterRouter = ({ controllers, services, authenticate, authorize }) => {
  const router = express.Router();
  router.use('/users', createCrudRouter({
    controller: controllers.users, authenticate, authorize,
    schemas: { create: masterSchemas.userCreate, update: masterSchemas.userUpdate, list: masterSchemas.userList, params: masterSchemas.userParams, uidParam: 'userUid' },
  }));
  router.use('/roles', createCrudRouter({
    controller: controllers.roles, authenticate, authorize,
    schemas: { create: masterSchemas.roleCreate, update: masterSchemas.roleUpdate, list: masterSchemas.roleList, params: masterSchemas.roleParams, uidParam: 'roleUid' },
  }));
  router.use('/menus', createCrudRouter({
    controller: controllers.menus, authenticate, authorize,
    schemas: { create: masterSchemas.menuCreate, update: masterSchemas.menuUpdate, list: masterSchemas.menuList, params: masterSchemas.menuParams, uidParam: 'menuUid' },
  }));
  router.use('/permissions', createCrudRouter({
    controller: controllers.permissions, authenticate, authorize,
    schemas: { create: masterSchemas.permissionCreate, update: masterSchemas.permissionUpdate, list: masterSchemas.permissionList, params: masterSchemas.permissionParams, uidParam: 'permissionUid' },
  }));

  const settingsRouter = express.Router();
  settingsRouter.get('/public', asyncHandler(async (req, res) => sendSuccess(req, res, {
    message: 'Public application settings fetched successfully.', data: await services.settingService.listPublic(),
  })));
  settingsRouter.use(createCrudRouter({
    controller: controllers.settings, authenticate, authorize,
    schemas: { create: masterSchemas.settingCreate, update: masterSchemas.settingUpdate, list: masterSchemas.settingList, params: masterSchemas.settingParams, uidParam: 'settingUid' },
  }));
  router.use('/general-settings', settingsRouter);
  return router;
};

module.exports = { createMasterRouter };
