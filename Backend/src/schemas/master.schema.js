const { Joi, uid, booleanQuery, listQuery, uidParams } = require('./common.schema');
const { password, email } = require('./auth.schema');

const userCreate = Joi.object({
  roleUid: uid.required(), fullName: Joi.string().trim().min(2).max(120).required(),
  email: email.required(), password: password.required(), emailVerified: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
});
const userUpdate = Joi.object({
  roleUid: uid, fullName: Joi.string().trim().min(2).max(120), email, password,
  emailVerified: Joi.boolean(), isActive: Joi.boolean(),
}).min(1);
const userList = listQuery.keys({ roleUid: uid, emailVerified: booleanQuery, isActive: booleanQuery });

const roleCreate = Joi.object({
  roleName: Joi.string().trim().min(2).max(80).required(), description: Joi.string().trim().max(500).allow('', null),
  isSystem: Joi.boolean().default(false), isActive: Joi.boolean().default(true),
});
const roleUpdate = Joi.object({
  roleName: Joi.string().trim().min(2).max(80), description: Joi.string().trim().max(500).allow('', null),
  isSystem: Joi.boolean(), isActive: Joi.boolean(),
}).min(1);
const roleList = listQuery.keys({ isSystem: booleanQuery, isActive: booleanQuery });

const menuFields = {
  parentMenuUid: uid.allow(null), menuName: Joi.string().trim().min(2).max(100),
  menuCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]+$/).max(80),
  routePath: Joi.string().trim().max(255).allow('', null), icon: Joi.string().trim().max(100).allow('', null),
  displayOrder: Joi.number().integer().min(0), isVisible: Joi.boolean(), isActive: Joi.boolean(),
};
const menuCreate = Joi.object(menuFields).fork(['menuName', 'menuCode'], (schema) => schema.required())
  .prefs({ errors: { label: 'key' } });
const menuUpdate = Joi.object(menuFields).min(1);
const menuList = listQuery.keys({ parentMenuUid: uid, isVisible: booleanQuery, isActive: booleanQuery });

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const permissionFields = {
  roleUid: uid, menuUid: uid.allow(null), permissionName: Joi.string().trim().min(2).max(120),
  permissionCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]+$/).max(120),
  httpMethod: Joi.string().uppercase().valid(...methods), apiPath: Joi.string().trim().pattern(/^\/api\//).max(255),
  isAllowed: Joi.boolean(), isActive: Joi.boolean(),
};
const permissionCreate = Joi.object(permissionFields).fork(
  ['roleUid', 'permissionName', 'permissionCode', 'httpMethod', 'apiPath'],
  (schema) => schema.required(),
);
const permissionUpdate = Joi.object(permissionFields).min(1);
const permissionList = listQuery.keys({
  roleUid: uid, menuUid: uid, httpMethod: Joi.string().uppercase().valid(...methods),
  isAllowed: booleanQuery, isActive: booleanQuery,
});

const settingFields = {
  settingKey: Joi.string().trim().pattern(/^[A-Za-z][A-Za-z0-9.\-_]*$/).max(120),
  settingValue: Joi.string().max(10000).allow(''), valueType: Joi.string().valid('string', 'number', 'boolean', 'json'),
  settingGroup: Joi.string().trim().max(80), description: Joi.string().trim().max(500).allow('', null),
  isPublic: Joi.boolean(), isActive: Joi.boolean(),
};
const settingCreate = Joi.object(settingFields).fork(['settingKey', 'settingValue'], (schema) => schema.required());
const settingUpdate = Joi.object(settingFields).min(1);
const settingList = listQuery.keys({
  settingGroup: Joi.string().trim().max(80), valueType: Joi.string().valid('string', 'number', 'boolean', 'json'),
  isPublic: booleanQuery, isActive: booleanQuery,
});

module.exports = {
  userCreate, userUpdate, userList, userParams: uidParams('userUid'),
  roleCreate, roleUpdate, roleList, roleParams: uidParams('roleUid'),
  menuCreate, menuUpdate, menuList, menuParams: uidParams('menuUid'),
  permissionCreate, permissionUpdate, permissionList, permissionParams: uidParams('permissionUid'),
  settingCreate, settingUpdate, settingList, settingParams: uidParams('settingUid'),
};
