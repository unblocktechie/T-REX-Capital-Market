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
const { TokenDeploymentAttemptRepository } = require('../repositories/token-deployment-attempt.repository');
const { InvestorRepository } = require('../repositories/investor.repository');
const { InvestorOptionRepository } = require('../repositories/investor-option.repository');
const { InvestmentRepository } = require('../repositories/investment.repository');
const { IssuerClaimRepository } = require('../repositories/issuer-claim.repository');
const { InvestorClaimSubmissionRepository } = require('../repositories/investor-claim-submission.repository');
const { ClaimIndexerRepository } = require('../repositories/claim-indexer.repository');
const { IdentityRegistryRegistrationRepository } = require('../repositories/identity-registry-registration.repository');
const { TokenPurchaseRepository } = require('../repositories/token-purchase.repository');
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
const { TrexDeploymentSyncService } = require('../services/blockchain/trex-deployment-sync.service');
const { TokenService } = require('../services/token.service');
const { TokenDeploymentAttemptService } = require('../services/token-deployment-attempt.service');
const { InvestorService } = require('../services/investor.service');
const { InvestmentService } = require('../services/investment.service');
const { IssuerClaimService } = require('../services/issuer-claim.service');
const { InvestorClaimService } = require('../services/investor-claim.service');
const { ClaimSignatureService } = require('../services/blockchain/claim-signature.service');
const { ClaimSubmissionVerifierService } = require('../services/blockchain/claim-submission-verifier.service');
const { ClaimStateService } = require('../services/blockchain/claim-state.service');
const { ClaimIndexerService } = require('../services/blockchain/claim-indexer.service');
const { IdentityRegistryVerifierService } = require('../services/blockchain/identity-registry-verifier.service');
const { IdentityRegistryReconciliationService } = require('../services/blockchain/identity-registry-reconciliation.service');
const { IdentityRegistryRegistrationService } = require('../services/identity-registry-registration.service');
const { TokenPurchaseService } = require('../services/token-purchase.service');
const { TokenPurchaseBlockchainService } = require('../services/blockchain/token-purchase-blockchain.service');
const { TokenPurchaseMintService } = require('../services/blockchain/token-purchase-mint.service');
const { TokenPurchaseReconciliationService } = require('../services/blockchain/token-purchase-reconciliation.service');
const { TokenImageService } = require('../services/common/token-image.service');
const { TrexDeploymentSyncRunner } = require('../jobs/trex-deployment-sync.runner');
const { ClaimRecoveryService } = require('../services/blockchain/claim-recovery.service');
const { ClaimRecoveryRunner } = require('../jobs/claim-recovery.runner');
const { ClaimIndexerRunner } = require('../jobs/claim-indexer.runner');
const { IdentityRegistryReconciliationRunner } = require('../jobs/identity-registry-reconciliation.runner');
const { TokenPurchaseReconciliationRunner } = require('../jobs/token-purchase-reconciliation.runner');
const emailService = require('../services/common/email.service');
const { createCrudController } = require('../api/v1/controllers/crud.controller');
const { createAuthController } = require('../api/v1/controllers/auth.controller');
const { createLocationController } = require('../api/v1/controllers/location.controller');
const { createOrganizationController } = require('../api/v1/controllers/organization.controller');
const { createOrganizationAdminController } = require('../api/v1/controllers/organization-admin.controller');
const { createTokenController } = require('../api/v1/controllers/token.controller');
const { createDeploymentAttemptController } = require('../api/v1/controllers/deployment-attempt.controller');
const { createInvestorController } = require('../api/v1/controllers/investor.controller');
const { createInvestmentController } = require('../api/v1/controllers/investment.controller');
const { createIssuerClaimController } = require('../api/v1/controllers/issuer-claim.controller');
const { createInvestorClaimController } = require('../api/v1/controllers/investor-claim.controller');
const { createIdentityRegistryRegistrationController } = require('../api/v1/controllers/identity-registry-registration.controller');
const { createTokenPurchaseController } = require('../api/v1/controllers/token-purchase.controller');
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
const tokenDeploymentAttemptRepository = new TokenDeploymentAttemptRepository();
const investorRepository = new InvestorRepository();
const investorOptionRepository = new InvestorOptionRepository();
const investmentRepository = new InvestmentRepository();
const issuerClaimRepository = new IssuerClaimRepository();
const investorClaimSubmissionRepository = new InvestorClaimSubmissionRepository();
const claimIndexerRepository = new ClaimIndexerRepository();
const identityRegistryRegistrationRepository = new IdentityRegistryRegistrationRepository();
const tokenPurchaseRepository = new TokenPurchaseRepository();
const claimSignatureService = new ClaimSignatureService();
const claimSubmissionVerifierService = new ClaimSubmissionVerifierService();
const claimStateService = new ClaimStateService();
const identityRegistryVerifierService = new IdentityRegistryVerifierService();
const tokenImageService = new TokenImageService();
const tokenDeploymentReceiptService = new TokenDeploymentReceiptService();
const tokenPurchaseBlockchainService = new TokenPurchaseBlockchainService();

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
  attemptRepository: tokenDeploymentAttemptRepository,
});
const tokenDeploymentAttemptService = new TokenDeploymentAttemptService({
  attemptRepository: tokenDeploymentAttemptRepository,
  tokenRepository,
  organizationRepository,
  tokenService,
  deploymentReceiptService: tokenDeploymentReceiptService,
});
const trexDeploymentSyncService = new TrexDeploymentSyncService({
  settingRepository,
  organizationRepository,
  tokenRepository,
  attemptRepository: tokenDeploymentAttemptRepository,
});
const trexDeploymentSyncRunner = new TrexDeploymentSyncRunner(trexDeploymentSyncService);
const claimRecoveryService = new ClaimRecoveryService({
  settingRepository,
  submissionRepository: investorClaimSubmissionRepository,
  issuerClaimRepository,
  interestRepository: investmentRepository,
  tokenRepository,
});
const claimRecoveryRunner = new ClaimRecoveryRunner(claimRecoveryService);
const claimIndexerService = new ClaimIndexerService({
  settingRepository,
  indexerRepository: claimIndexerRepository,
  submissionRepository: investorClaimSubmissionRepository,
  recoveryService: claimRecoveryService,
});
const claimIndexerRunner = new ClaimIndexerRunner(claimIndexerService);
const identityRegistryRegistrationService = new IdentityRegistryRegistrationService({
  repository: identityRegistryRegistrationRepository,
  interestRepository: investmentRepository,
  verifier: identityRegistryVerifierService,
});
const identityRegistryReconciliationService = new IdentityRegistryReconciliationService({
  settingRepository,
  repository: identityRegistryRegistrationRepository,
  checkpointRepository: claimIndexerRepository,
  verifier: identityRegistryVerifierService,
  finalizationService: identityRegistryRegistrationService,
});
const identityRegistryReconciliationRunner = new IdentityRegistryReconciliationRunner(identityRegistryReconciliationService);
const tokenPurchaseMintService = new TokenPurchaseMintService({
  repository: tokenPurchaseRepository,
  checkpointRepository: claimIndexerRepository,
  blockchain: tokenPurchaseBlockchainService,
});
const tokenPurchaseService = new TokenPurchaseService({
  repository: tokenPurchaseRepository,
  blockchain: tokenPurchaseBlockchainService,
  mintService: tokenPurchaseMintService,
});
const tokenPurchaseReconciliationService = new TokenPurchaseReconciliationService({
  settingRepository,
  repository: tokenPurchaseRepository,
  checkpointRepository: claimIndexerRepository,
  blockchain: tokenPurchaseBlockchainService,
  mintService: tokenPurchaseMintService,
});
const tokenPurchaseReconciliationRunner = new TokenPurchaseReconciliationRunner(tokenPurchaseReconciliationService);
const investmentService = new InvestmentService({
  repository: investmentRepository,
  tokenRepository,
  investorRepository,
  organizationRepository,
  tokenImageService,
  // approveInterest requires a SIGNED issuer claim verification before promoting to verifiedByIssuer.
  issuerClaimRepository,
});
const investorService = new InvestorService({
  repository: investorRepository,
  optionRepository: investorOptionRepository,
  locationService,
  identityService: organizationIdentityService,
  // Enforces the investment-interest upload gate + resubmission sync on document upload.
  investmentService,
});
const issuerClaimService = new IssuerClaimService({
  repository: issuerClaimRepository,
  interestRepository: investmentRepository,
  organizationRepository,
  tokenRepository,
  claimSignatureService,
});
const investorClaimService = new InvestorClaimService({
  repository: investorClaimSubmissionRepository,
  interestRepository: investmentRepository,
  issuerClaimRepository,
  investorRepository,
  tokenRepository,
  verifier: claimSubmissionVerifierService,
  // Retry endpoint reuses the fallback runner's targeted reconciliation.
  recoveryService: claimRecoveryService,
  claimStateService,
  claimIndexerService,
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
  deploymentAttempts: createDeploymentAttemptController(tokenDeploymentAttemptService),
  investors: createInvestorController(investorService, investorOptionRepository),
  investments: createInvestmentController(investmentService),
  issuerClaims: createIssuerClaimController(issuerClaimService),
  investorClaims: createInvestorClaimController(investorClaimService),
  registryRegistrations: createIdentityRegistryRegistrationController(identityRegistryRegistrationService),
  tokenPurchases: createTokenPurchaseController(tokenPurchaseService),
};

module.exports = {
  controllers,
  services: {
    authService, userService, roleService, menuService, permissionService, settingService,
    locationService, organizationService, organizationAdminService, organizationIdentityService,
    tokenService, tokenDeploymentAttemptService, tokenImageService, tokenDeploymentReceiptService,
    trexDeploymentSyncService, investorService, investmentService, issuerClaimService, claimSignatureService,
    investorClaimService, claimSubmissionVerifierService, claimStateService, claimRecoveryService, claimIndexerService,
    identityRegistryRegistrationService, identityRegistryVerifierService, identityRegistryReconciliationService,
    tokenPurchaseService, tokenPurchaseBlockchainService, tokenPurchaseMintService, tokenPurchaseReconciliationService,
  },
  repositories: {
    userRepository, roleRepository, menuRepository, permissionRepository, settingRepository, authTokenRepository,
    locationRepository, organizationOptionRepository, organizationRepository, tokenRepository, tokenOptionRepository,
    tokenDeploymentAttemptRepository, investorRepository, investorOptionRepository, investmentRepository, issuerClaimRepository,
    investorClaimSubmissionRepository, claimIndexerRepository,
    identityRegistryRegistrationRepository,
    tokenPurchaseRepository,
  },
  jobs: {
    trexDeploymentSyncRunner,
    claimRecoveryRunner,
    claimIndexerRunner,
    identityRegistryReconciliationRunner,
    tokenPurchaseReconciliationRunner,
  },
  authenticate: createAuthenticate(userRepository),
  authorize: createAuthorize(permissionRepository),
};
