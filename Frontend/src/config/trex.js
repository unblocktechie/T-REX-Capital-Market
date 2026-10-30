const text = (value) => (typeof value === 'string' ? value.trim() : '');

const objectOrEmpty = (value) =>
  value && !Array.isArray(value) && typeof value === 'object' ? value : {};

/**
 * Resolve the browser-safe T-REX deployment configuration returned by
 * GET /chains/{chainUid}/config. The backend is the only source of truth for
 * chain-scoped contract addresses.
 */
export const resolveTrexDeploymentConfig = ({ chainConfig = {}, controllerAddress = '' } = {}) => {
  const contracts = objectOrEmpty(chainConfig.contracts);
  const platform = objectOrEmpty(contracts.platform);
  const complianceModules = objectOrEmpty(platform.complianceModules);
  const implementations = objectOrEmpty(contracts.implementations);

  return {
    gateway: text(platform.trexGateway),
    complianceModules: {
      countryRestrict: text(complianceModules.countryRestrict),
      maxBalance: text(complianceModules.maxBalance),
      maxInvestors: text(complianceModules.maxInvestors),
    },
    identityFactory: text(platform.identityFactory),
    platformController: text(platform.platformController) || text(controllerAddress),
    trexFactory: text(platform.trexFactory),
    paymentTokens: Array.isArray(chainConfig.paymentTokens) ? [...chainConfig.paymentTokens] : [],
    platform,
    implementations,
  };
};
