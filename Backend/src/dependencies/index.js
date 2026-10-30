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
const { PaymentTokenRepository } = require('../repositories/payment-token.repository');
const { ChainRepository } = require('../repositories/chain.repository');
const { ChainAuditRepository } = require('../repositories/chain-audit.repository');
const { UserChainIdentityRepository } = require('../repositories/user-chain-identity.repository');
const { TokenDeploymentAttemptRepository } = require('../repositories/token-deployment-attempt.repository');
const { InvestorRepository } = require('../repositories/investor.repository');
const { InvestorOptionRepository } = require('../repositories/investor-option.repository');
const { InvestmentRepository } = require('../repositories/investment.repository');
const { IssuerClaimRepository } = require('../repositories/issuer-claim.repository');
const { InvestorClaimSubmissionRepository } = require('../repositories/investor-claim-submission.repository');
const { ClaimIndexerRepository } = require('../repositories/claim-indexer.repository');
const { IdentityRegistryRegistrationRepository } = require('../repositories/identity-registry-registration.repository');
const { TokenPurchaseRepository } = require('../repositories/token-purchase.repository');
const { TokenRedemptionRepository } = require('../repositories/token-redemption.repository');
const { TokenTransferRepository } = require('../repositories/token-transfer.repository');
const { BlockchainTransactionRepository } = require('../repositories/blockchain-transaction.repository');
const { InvestorInvitationRepository } = require('../repositories/investor-invitation.repository');
const { WalletOwnershipRepository } = require('../repositories/wallet-ownership.repository');
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
const { ApplicationJourneyService } = require('../services/application-journey.service');
const { TokenHolderSummaryService } = require('../services/blockchain/token-holder-summary.service');
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
const { TokenRedemptionService } = require('../services/token-redemption.service');
const { TokenRedemptionBlockchainService } = require('../services/blockchain/token-redemption-blockchain.service');
const { PaymentTokenRegistryService } = require('../services/blockchain/payment-token-registry.service');
const { ChainRuntimeService } = require('../services/chain-runtime.service');
const { ChainAdminService } = require('../services/chain-admin.service');
const { ChainPublicConfigurationService } = require('../services/chain-public-configuration.service');
const { PaymentTokenAdminService } = require('../services/payment-token-admin.service');
const { UserChainIdentityService } = require('../services/user-chain-identity.service');
const { TokenTransferService } = require('../services/token-transfer.service');
const { BlockchainTransactionService } = require('../services/blockchain/blockchain-transaction.service');
const { MultiChainBlockchainTransactionService } = require('../services/blockchain/multi-chain-blockchain-transaction.service');
const { BlockchainTransactionIndexerService } = require('../services/blockchain/blockchain-transaction-indexer.service');
const { MultiChainRunnerService } = require('../services/blockchain/multi-chain-runner.service');
const { InvestorInvitationService } = require('../services/investor-invitation.service');
const { TokenImageService } = require('../services/common/token-image.service');
const { TrexDeploymentSyncRunner } = require('../jobs/trex-deployment-sync.runner');
const { ClaimRecoveryService } = require('../services/blockchain/claim-recovery.service');
const { ClaimRecoveryRunner } = require('../jobs/claim-recovery.runner');
const { ClaimIndexerRunner } = require('../jobs/claim-indexer.runner');
const { IdentityRegistryReconciliationRunner } = require('../jobs/identity-registry-reconciliation.runner');
const { BlockchainTransactionIndexerRunner } = require('../jobs/blockchain-transaction-indexer.runner');
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
const { createTokenRedemptionController } = require('../api/v1/controllers/token-redemption.controller');
const { createTokenTransferController } = require('../api/v1/controllers/token-transfer.controller');
const { createBlockchainTransactionController } = require('../api/v1/controllers/blockchain-transaction.controller');
const { createInvestorInvitationController } = require('../api/v1/controllers/investor-invitation.controller');
const { createChainController } = require('../api/v1/controllers/chain.controller');
const { createPaymentTokenAdminController } = require('../api/v1/controllers/payment-token-admin.controller');
const { createAuthenticate } = require('../middleware/authenticate.middleware');
const { createAuthorize } = require('../middleware/authorize.middleware');
const { createRequireInvestorChain } = require('../middleware/investor-chain.middleware');

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
const chainRepository = new ChainRepository();
const chainAuditRepository = new ChainAuditRepository();
const userChainIdentityRepository = new UserChainIdentityRepository();
const paymentTokenRepository = new PaymentTokenRepository();
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
const tokenRedemptionRepository = new TokenRedemptionRepository();
const tokenTransferRepository = new TokenTransferRepository();
const blockchainTransactionRepository = new BlockchainTransactionRepository();
const investorInvitationRepository = new InvestorInvitationRepository();
const walletOwnershipRepository = new WalletOwnershipRepository();
const masterImageService = new TokenImageService();
const chainRuntimeService = new ChainRuntimeService({ repository: chainRepository });
const requireInvestorChain = createRequireInvestorChain(chainRuntimeService);
const chainAdminService = new ChainAdminService({
  repository: chainRepository,
  auditRepository: chainAuditRepository,
  paymentTokenRepository,
  runtimeService: chainRuntimeService,
  imageService: masterImageService,
});
const paymentTokenAdminService = new PaymentTokenAdminService({
  repository: paymentTokenRepository,
  chainRuntimeService,
  imageService: masterImageService,
});
const claimSignatureService = new ClaimSignatureService();
const claimSubmissionVerifierService = new ClaimSubmissionVerifierService();
const claimStateService = new ClaimStateService();
const identityRegistryVerifierService = new IdentityRegistryVerifierService();
const tokenImageService = new TokenImageService();
const tokenDeploymentReceiptService = new TokenDeploymentReceiptService();
const tokenRedemptionBlockchainService = new TokenRedemptionBlockchainService(undefined, {
  paymentTokenRepository,
});
const paymentTokenRegistryService = new PaymentTokenRegistryService({ paymentTokenRepository, chainRuntimeService });
const chainPublicConfigurationService = new ChainPublicConfigurationService({
  chainRepository,
  paymentTokenRegistryService,
});
const userChainIdentityService = new UserChainIdentityService({
  repository: userChainIdentityRepository,
  chainRuntimeService,
  identityService: organizationIdentityService,
  organizationRepository,
  investorRepository,
});

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
  walletOwnershipRepository,
  chainRuntimeService,
  userChainIdentityService,
});
const organizationAdminService = new OrganizationAdminService(
  organizationRepository,
  organizationIdentityService,
  undefined,
  { chainRuntimeService, userChainIdentityService },
);
const tokenService = new TokenService({
  repository: tokenRepository,
  organizationRepository,
  optionRepository: tokenOptionRepository,
  locationRepository,
  imageService: tokenImageService,
  deploymentReceiptService: tokenDeploymentReceiptService,
  attemptRepository: tokenDeploymentAttemptRepository,
  paymentTokenRepository,
  chainRuntimeService,
  userChainIdentityRepository,
});
const tokenDeploymentAttemptService = new TokenDeploymentAttemptService({
  attemptRepository: tokenDeploymentAttemptRepository,
  tokenRepository,
  organizationRepository,
  tokenService,
  deploymentReceiptService: tokenDeploymentReceiptService,
  chainRuntimeService,
});
const trexDeploymentSyncService = new MultiChainRunnerService({
  chainRuntimeService, settingRepository, name: 'TREX deployment sync',
  factory: (config) => new TrexDeploymentSyncService({
    settingRepository, organizationRepository, tokenRepository,
    attemptRepository: tokenDeploymentAttemptRepository, config,
  }),
});
const trexDeploymentSyncRunner = new TrexDeploymentSyncRunner(trexDeploymentSyncService);
const applicationJourneyService = new ApplicationJourneyService({
  registryRepository: identityRegistryRegistrationRepository, interestRepository: investmentRepository,
});
const claimRecoveryService = new ClaimRecoveryService({
  journeyService: applicationJourneyService,
  settingRepository,
  submissionRepository: investorClaimSubmissionRepository,
  issuerClaimRepository,
  interestRepository: investmentRepository,
  tokenRepository,
});
const claimRecoveryRunnerService = new MultiChainRunnerService({
  chainRuntimeService, settingRepository, name: 'Claim recovery',
  factory: (config) => new ClaimRecoveryService({
    journeyService: applicationJourneyService,
    settingRepository, submissionRepository: investorClaimSubmissionRepository,
    issuerClaimRepository, interestRepository: investmentRepository, tokenRepository, config,
  }),
});
const claimRecoveryRunner = new ClaimRecoveryRunner(claimRecoveryRunnerService);
const claimIndexerService = new ClaimIndexerService({
  settingRepository,
  indexerRepository: claimIndexerRepository,
  submissionRepository: investorClaimSubmissionRepository,
  recoveryService: claimRecoveryService,
});
const claimIndexerRunnerService = new MultiChainRunnerService({
  chainRuntimeService, settingRepository, name: 'Claim indexer',
  factory: (config) => {
    const recoveryService = new ClaimRecoveryService({
      journeyService: applicationJourneyService,
      settingRepository, submissionRepository: investorClaimSubmissionRepository,
      issuerClaimRepository, interestRepository: investmentRepository, tokenRepository, config,
    });
    return new ClaimIndexerService({
      settingRepository, indexerRepository: claimIndexerRepository,
      submissionRepository: investorClaimSubmissionRepository, recoveryService, config,
    });
  },
});
const claimIndexerRunner = new ClaimIndexerRunner(claimIndexerRunnerService);
const identityRegistryRegistrationService = new IdentityRegistryRegistrationService({
  journeyService: applicationJourneyService,
  repository: identityRegistryRegistrationRepository,
  interestRepository: investmentRepository,
  verifier: identityRegistryVerifierService,
  chainRuntimeService,
});
const identityRegistryReconciliationService = new IdentityRegistryReconciliationService({
  settingRepository,
  repository: identityRegistryRegistrationRepository,
  checkpointRepository: claimIndexerRepository,
  verifier: identityRegistryVerifierService,
  finalizationService: identityRegistryRegistrationService,
});
const identityRegistryRunnerService = new MultiChainRunnerService({
  chainRuntimeService, settingRepository, name: 'Identity Registry reconciliation',
  factory: (config) => {
    const verifier = new IdentityRegistryVerifierService(config);
    const finalizationService = new IdentityRegistryRegistrationService({
      journeyService: applicationJourneyService,
      repository: identityRegistryRegistrationRepository,
      interestRepository: investmentRepository,
      verifier,
      config,
    });
    return new IdentityRegistryReconciliationService({
      settingRepository, repository: identityRegistryRegistrationRepository,
      checkpointRepository: claimIndexerRepository, verifier, finalizationService, config,
    });
  },
});
const identityRegistryReconciliationRunner = new IdentityRegistryReconciliationRunner(identityRegistryRunnerService);
const blockchainTransactionService = new MultiChainBlockchainTransactionService({
  repository: blockchainTransactionRepository,
  paymentTokenRepository,
  chainRuntimeService,
});
const tokenPurchaseService = new TokenPurchaseService({
  repository: tokenPurchaseRepository,
  investmentRepository,
  tokenRepository,
  paymentTokenRepository,
});
const tokenRedemptionService = new TokenRedemptionService({
  repository: tokenRedemptionRepository,
  blockchain: tokenRedemptionBlockchainService,
  paymentTokenRepository,
  chainRuntimeService,
});
const tokenTransferService = new TokenTransferService({
  repository: tokenTransferRepository,
});
const blockchainTransactionIndexerService = new MultiChainRunnerService({
  chainRuntimeService, settingRepository, name: 'Canonical transaction indexer',
  factory: (config) => {
    const transactionService = new BlockchainTransactionService({
      repository: blockchainTransactionRepository, paymentTokenRepository, config,
    });
    return new BlockchainTransactionIndexerService({
      settingRepository, repository: blockchainTransactionRepository,
      checkpointRepository: claimIndexerRepository, transactionService, config,
    });
  },
});
const blockchainTransactionIndexerRunner = new BlockchainTransactionIndexerRunner(blockchainTransactionIndexerService);
const tokenHolderSummaryService = new TokenHolderSummaryService({ chainRepository });
const investmentService = new InvestmentService({
  journeyService: applicationJourneyService,
  getHolderSummary: token => tokenHolderSummaryService.summary(token),
  repository: investmentRepository,
  tokenRepository,
  investorRepository,
  organizationRepository,
  tokenImageService,
  paymentTokenRepository,
  userChainIdentityRepository,
  // approveInterest requires a SIGNED issuer claim verification before promoting to verifiedByIssuer.
  issuerClaimRepository,
});
const investorInvitationService = new InvestorInvitationService({
  repository: investorInvitationRepository,
  investorRepository,
  investmentService,
  emailService,
});
const investorService = new InvestorService({
  repository: investorRepository,
  optionRepository: investorOptionRepository,
  locationService,
  identityService: organizationIdentityService,
  walletOwnershipRepository,
  chainRuntimeService,
  userChainIdentityService,
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
  journeyService: applicationJourneyService,
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
  chainServicesFactory: async (chainUid, chainId) => {
    const config = chainUid
      ? await chainRuntimeService.byUid(chainUid)
      : await chainRuntimeService.byChainId(chainId);
    const verifier = new ClaimSubmissionVerifierService(config);
    const state = new ClaimStateService(config);
    const recovery = new ClaimRecoveryService({
      journeyService: applicationJourneyService,
      settingRepository, submissionRepository: investorClaimSubmissionRepository,
      issuerClaimRepository, interestRepository: investmentRepository, tokenRepository, config,
    });
    const indexer = new ClaimIndexerService({
      settingRepository, indexerRepository: claimIndexerRepository,
      submissionRepository: investorClaimSubmissionRepository, recoveryService: recovery, config,
    });
    return { verifier, claimStateService: state, recoveryService: recovery, claimIndexerService: indexer };
  },
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
  tokens: createTokenController(tokenService, tokenOptionRepository, paymentTokenRegistryService),
  deploymentAttempts: createDeploymentAttemptController(tokenDeploymentAttemptService),
  investors: createInvestorController(investorService, investorOptionRepository),
  investments: createInvestmentController(investmentService),
  issuerClaims: createIssuerClaimController(issuerClaimService),
  investorClaims: createInvestorClaimController(investorClaimService),
  registryRegistrations: createIdentityRegistryRegistrationController(identityRegistryRegistrationService),
  tokenPurchases: createTokenPurchaseController(tokenPurchaseService),
  tokenRedemptions: createTokenRedemptionController(tokenRedemptionService),
  tokenTransfers: createTokenTransferController(tokenTransferService),
  blockchainTransactions: createBlockchainTransactionController(blockchainTransactionService),
  investorInvitations: createInvestorInvitationController(investorInvitationService),
  chains: createChainController({
    runtimeService: chainRuntimeService,
    publicConfigurationService: chainPublicConfigurationService,
    adminService: chainAdminService,
    identityService: userChainIdentityService,
  }),
  paymentTokenAdmin: createPaymentTokenAdminController(paymentTokenAdminService),
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
    tokenPurchaseService,
    tokenRedemptionService, tokenRedemptionBlockchainService,
    paymentTokenRegistryService,
    chainRuntimeService, chainAdminService, chainPublicConfigurationService, paymentTokenAdminService, userChainIdentityService,
    tokenTransferService,
    blockchainTransactionService, blockchainTransactionIndexerService,
    investorInvitationService,
  },
  repositories: {
    userRepository, roleRepository, menuRepository, permissionRepository, settingRepository, authTokenRepository,
    locationRepository, organizationOptionRepository, organizationRepository, tokenRepository, tokenOptionRepository,
    paymentTokenRepository,
    chainRepository, userChainIdentityRepository,
    tokenDeploymentAttemptRepository, investorRepository, investorOptionRepository, investmentRepository, issuerClaimRepository,
    investorClaimSubmissionRepository, claimIndexerRepository,
    identityRegistryRegistrationRepository,
    tokenPurchaseRepository,
    tokenRedemptionRepository,
    tokenTransferRepository,
    blockchainTransactionRepository,
    investorInvitationRepository,
  },
  jobs: {
    trexDeploymentSyncRunner,
    claimRecoveryRunner,
    claimIndexerRunner,
    identityRegistryReconciliationRunner,
    blockchainTransactionIndexerRunner,
  },
  authenticate: createAuthenticate(userRepository),
  authorize: createAuthorize(permissionRepository),
  requireInvestorChain,
};
