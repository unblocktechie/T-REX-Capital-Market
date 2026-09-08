const { UserRepository } = require('../repositories/user.repository');
const { RoleRepository } = require('../repositories/role.repository');
const { MenuRepository } = require('../repositories/menu.repository');
const { PermissionRepository } = require('../repositories/permission.repository');
const { GeneralSettingRepository } = require('../repositories/general-setting.repository');
const { AuthTokenRepository } = require('../repositories/auth-token.repository');
const { LocationRepository } = require('../repositories/location.repository');
const { OrganizationOptionRepository } = require('../repositories/organization-option.repository');
const { OrganizationRepository } = require('../repositories/organization.repository');
const { TokenRepository } = require('../repositories/token.repository');
const { TokenOptionRepository } = require('../repositories/token-option.repository');
const { UserService } = require('../services/user.service');
const { RoleService } = require('../services/role.service');
const { MenuService } = require('../services/menu.service');
const { PermissionService } = require('../services/permission.service');
const { GeneralSettingService } = require('../services/general-setting.service');
const { AuthService } = require('../services/auth.service');
const { LocationService } = require('../services/location.service');
const { OrganizationService } = require('../services/organization.service');
const { OrganizationAdminService } = require('../services/organization-admin.service');
const { OrganizationIdentityService } = require('../services/blockchain/organization-identity.service');
const { TokenDeploymentReceiptService } = require('../services/blockchain/token-deployment-receipt.service');
const { TokenService } = require('../services/token.service');
const { TokenImageService } = require('../services/common/token-image.service');
const emailService = require('../services/common/email.service');
const { createCrudController } = require('../api/v1/controllers/crud.controller');
const { createAuthController } = require('../api/v1/controllers/auth.controller');
const { createLocationController } = require('../api/v1/controllers/location.controller');
const { createOrganizationController } = require('../api/v1/controllers/organization.controller');
const { createOrganizationAdminController } = require('../api/v1/controllers/organization-admin.controller');
const { createTokenController } = require('../api/v1/controllers/token.controller');
const { createAuthenticate } = require('../middleware/authenticate.middleware');
const { createAuthorize } = require('../middleware/authorize.middleware');

const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const menuRepository = new MenuRepository();
const permissionRepository = new PermissionRepository();
const settingRepository = new GeneralSettingRepository();
const authTokenRepository = new AuthTokenRepository();
const locationRepository = new LocationRepository();
const organizationOptionRepository = new OrganizationOptionRepository();
const organizationRepository = new OrganizationRepository();
const organizationIdentityService = new OrganizationIdentityService();
const tokenRepository = new TokenRepository();
const tokenOptionRepository = new TokenOptionRepository();
const tokenImageService = new TokenImageService();
const tokenDeploymentReceiptService = new TokenDeploymentReceiptService();

const userService = new UserService(userRepository, roleRepository);
const roleService = new RoleService(roleRepository, userRepository, permissionRepository);
const menuService = new MenuService(menuRepository, permissionRepository);
const permissionService = new PermissionService(permissionRepository, roleRepository, menuRepository);
const settingService = new GeneralSettingService(settingRepository);
const authService = new AuthService({ userRepository, roleRepository, authTokenRepository, emailService });
const locationService = new LocationService(locationRepository);
const organizationService = new OrganizationService({
  repository: organizationRepository,
  optionRepository: organizationOptionRepository,
  locationService,
});
const organizationAdminService = new OrganizationAdminService(
  organizationRepository,
  organizationIdentityService,
);
const tokenService = new TokenService({
  repository: tokenRepository,
  organizationRepository,
  optionRepository: tokenOptionRepository,
  locationRepository,
  imageService: tokenImageService,
  deploymentReceiptService: tokenDeploymentReceiptService,
});

const controllers = {
  auth: createAuthController(authService),
  users: createCrudController(userService, { singular: 'User', plural: 'Users', uidParam: 'userUid' }),
  roles: createCrudController(roleService, { singular: 'Role', plural: 'Roles', uidParam: 'roleUid' }),
  menus: createCrudController(menuService, { singular: 'Menu', plural: 'Menus', uidParam: 'menuUid' }),
  permissions: createCrudController(permissionService, { singular: 'Permission', plural: 'Permissions', uidParam: 'permissionUid' }),
  settings: createCrudController(settingService, { singular: 'General setting', plural: 'General settings', uidParam: 'settingUid' }),
  locations: createLocationController(locationService),
  organizations: createOrganizationController(organizationService, organizationOptionRepository),
  organizationAdmin: createOrganizationAdminController(organizationAdminService),
  tokens: createTokenController(tokenService, tokenOptionRepository),
};

module.exports = {
  controllers,
  services: {
    authService, userService, roleService, menuService, permissionService, settingService,
    locationService, organizationService, organizationAdminService, organizationIdentityService,
    tokenService, tokenImageService, tokenDeploymentReceiptService,
  },
  repositories: {
    userRepository, roleRepository, menuRepository, permissionRepository, settingRepository, authTokenRepository,
    locationRepository, organizationOptionRepository, organizationRepository, tokenRepository, tokenOptionRepository,
  },
  authenticate: createAuthenticate(userRepository),
  authorize: createAuthorize(permissionRepository),
};
