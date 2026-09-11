const { logger } = require('../services/common/log.service');
const { SETTING_KEYS, DEFAULTS } = require('../services/blockchain/blockchain-transaction-indexer.service');

class BlockchainTransactionIndexerRunner {
  constructor(service, { initialDelayMs = 10000 } = {}) {
    this.service = service;
    this.initialDelayMs = initialDelayMs;
    this.timer = null;
    this.running = false;
    this.stopped = false;
  }

  start() {
    this.stopped = false;
    this.schedule(this.initialDelayMs);
    logger.info('Canonical transaction indexer scheduled', { initialDelayMs: this.initialDelayMs });
  }

  schedule(ms) {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick(), Math.max(1000, ms));
    if (this.timer.unref) this.timer.unref();
  }

  async tick() {
    if (!this.stopped && !this.running) {
      this.running = true;
      try { await this.service.run(); } catch (error) { logger.error('Canonical transaction indexer crashed', error); }
      finally { this.running = false; }
    }
    let seconds = DEFAULTS.intervalSeconds;
    try { seconds = await this.service.number(SETTING_KEYS.intervalSeconds, seconds); } catch {}
    this.schedule(seconds * 1000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { BlockchainTransactionIndexerRunner };
