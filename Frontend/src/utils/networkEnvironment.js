const normalizeDeploymentEnvironment = (value) =>
  String(value || '').trim().toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';

export const resolveNetworkEnvironment = (chain, deploymentEnvironment = 'testnet') => {
  if (typeof chain?.isTestnet === 'boolean') {
    return chain.isTestnet ? 'testnet' : 'mainnet';
  }

  return normalizeDeploymentEnvironment(deploymentEnvironment);
};

export const getNetworkEnvironmentLabel = (chain, deploymentEnvironment = 'testnet') =>
  resolveNetworkEnvironment(chain, deploymentEnvironment) === 'mainnet' ? 'Mainnet' : 'Testnet';
