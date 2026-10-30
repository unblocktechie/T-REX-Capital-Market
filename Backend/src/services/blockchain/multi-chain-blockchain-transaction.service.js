const { BlockchainTransactionService } = require('./blockchain-transaction.service');

class MultiChainBlockchainTransactionService {
  constructor({ repository, paymentTokenRepository, chainRuntimeService }) {
    this.repository = repository;
    this.paymentTokenRepository = paymentTokenRepository;
    this.chainRuntimeService = chainRuntimeService;
  }

  async serviceFor(chainId) {
    const config = chainId
      ? await this.chainRuntimeService.byChainId(chainId)
      : await this.chainRuntimeService.default();
    return new BlockchainTransactionService({
      repository: this.repository,
      paymentTokenRepository: this.paymentTokenRepository,
      config,
    });
  }

  async confirm(user, input) {
    return (await this.serviceFor(input.chainId)).confirm(user, input);
  }

  async synchronize(input) {
    return (await this.serviceFor(input.chainId)).synchronize(input);
  }

  async list(user, query) {
    return (await this.serviceFor(query.chainId)).list(user, query);
  }

  async exportCsv(user, query) {
    return (await this.serviceFor(query.chainId)).exportCsv(user, query);
  }
}

module.exports = { MultiChainBlockchainTransactionService };
