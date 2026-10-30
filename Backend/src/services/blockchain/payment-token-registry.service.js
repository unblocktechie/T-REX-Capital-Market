const ethers = require('ethers');
const { ApiError } = require('../../core/errors/api-error');

const PLATFORM_CONTROLLER_PAYMENT_TOKEN_ABI = [
  'function paymentTokens() view returns (address[])',
];

class PaymentTokenRegistryService {
  constructor({ paymentTokenRepository, chainRuntimeService = null, config = null, dependencies = {} }) {
    this.paymentTokenRepository = paymentTokenRepository;
    this.chainRuntimeService = chainRuntimeService;
    this.config = config;
    this.providerFactory = dependencies.providerFactory
      || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.contractFactory = dependencies.contractFactory
      || ((address, provider) => new ethers.Contract(address, PLATFORM_CONTROLLER_PAYMENT_TOKEN_ABI, provider));
  }

  rpcUrls(config) {
    return [...new Set([
      config.sepoliaRpcUrl,
      ...(config.sepoliaFallbackRpcUrls || []),
    ].filter(Boolean))];
  }

  controllerAddress(config) {
    if (!ethers.isAddress(config.platformControllerAddress || '')) {
      throw new ApiError(
        503,
        'Platform Controller payment-token registry is not configured.',
        undefined,
        'PAYMENT_TOKEN_REGISTRY_NOT_CONFIGURED',
      );
    }
    return ethers.getAddress(config.platformControllerAddress);
  }

  async resolveConfig(selector = {}) {
    if (typeof selector === 'number') selector = { chainId: selector };
    if (this.chainRuntimeService) {
      if (selector.chainUid) return this.chainRuntimeService.byUid(selector.chainUid);
      if (selector.chainId) return this.chainRuntimeService.byChainId(selector.chainId);
      return this.chainRuntimeService.default();
    }
    if (this.config) return this.config;
    throw new ApiError(503, 'Blockchain network is not configured.', undefined, 'CHAIN_NOT_CONFIGURED');
  }

  async onChainAddresses(config) {
    const rpcUrls = this.rpcUrls(config);
    if (!rpcUrls.length) {
      throw new ApiError(503, 'Blockchain RPC is not configured.', undefined, 'RPC_UNAVAILABLE');
    }

    const expectedChainId = Number(config.chainId);
    const controllerAddress = this.controllerAddress(config);
    for (const rpcUrl of rpcUrls) {
      const provider = this.providerFactory(rpcUrl);
      try {
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== expectedChainId) continue;
        const controller = this.contractFactory(controllerAddress, provider);
        const addresses = await controller.paymentTokens();
        if (!Array.isArray(addresses) || addresses.some((address) => !ethers.isAddress(address))) {
          throw new Error('Platform Controller returned invalid payment-token data.');
        }
        return addresses.map((address) => ethers.getAddress(address));
      } catch {
        // Try the next configured RPC. An unverified DB-only fallback is intentionally forbidden.
      } finally {
        if (typeof provider.destroy === 'function') provider.destroy();
      }
    }

    throw new ApiError(
      503,
      'Supported payment tokens could not be verified against the Platform Controller.',
      undefined,
      'PAYMENT_TOKEN_REGISTRY_UNAVAILABLE',
    );
  }

  async listEnabled(selector = {}, action = null) {
    if (typeof selector === 'number') selector = { chainId: selector, action };
    const config = await this.resolveConfig(selector);
    const [databaseTokens, onChainAddresses] = await Promise.all([
      this.paymentTokenRepository.listActive(config.chainId, selector.action || action),
      this.onChainAddresses(config),
    ]);
    const enabledAddresses = new Set(onChainAddresses.map((address) => address.toLowerCase()));
    return databaseTokens.filter(
      (token) => enabledAddresses.has(token.contractAddress.toLowerCase()),
    );
  }
}

module.exports = { PaymentTokenRegistryService, PLATFORM_CONTROLLER_PAYMENT_TOKEN_ABI };
