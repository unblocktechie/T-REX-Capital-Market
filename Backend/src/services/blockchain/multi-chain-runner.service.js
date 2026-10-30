const { logger } = require('../common/log.service');

class MultiChainRunnerService {
  constructor({ chainRuntimeService, settingRepository, name, factory }) {
    this.chainRuntimeService = chainRuntimeService;
    this.settingRepository = settingRepository;
    this.name = name;
    this.factory = factory;
  }

  async number(key, fallback) {
    const row = await this.settingRepository.findByKey(key);
    const value = Number(row?.settingValue);
    return Number.isFinite(value) ? value : fallback;
  }

  async getNumber(key, fallback) { return this.number(key, fallback); }

  async run() {
    const chains = await this.chainRuntimeService.listActiveRuntime();
    const results = [];
    for (const config of chains) {
      if (!config.transactionIndexerEnabled) {
        results.push({ chainId: config.chainId, chainUid: config.chainUid, enabled: false });
        continue;
      }
      try {
        // Sequential execution avoids an RPC burst when many networks are enabled.
        // Each underlying service still uses a chain-scoped DB checkpoint/lease.
        // eslint-disable-next-line no-await-in-loop
        const result = await this.factory(config).run();
        results.push({ chainId: config.chainId, chainUid: config.chainUid, ...result });
      } catch (error) {
        logger.error(`${this.name} failed for chain`, {
          chainId: config.chainId, chainUid: config.chainUid, error: error.message, stack: error.stack,
        });
        results.push({ chainId: config.chainId, chainUid: config.chainUid, error: error.message });
      }
    }
    return { chainCount: chains.length, results };
  }
}

module.exports = { MultiChainRunnerService };
