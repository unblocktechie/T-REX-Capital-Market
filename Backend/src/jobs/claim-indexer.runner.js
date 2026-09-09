const { logger } = require('../services/common/log.service');
const { SETTING_KEYS } = require('../services/blockchain/claim-indexer.service');

const SECOND_MS = 1000;
const DEFAULT_INTERVAL_SECONDS = 15;

class ClaimIndexerRunner {
  constructor(service, { initialDelayMs = 10000 } = {}) {
    this.service = service;
    this.initialDelayMs = initialDelayMs;
    this.timer = null;
    this.running = false;
    this.stopped = false;
  }

  start() {
    if (!this.service) return;
    this.stopped = false;
    this.schedule(this.initialDelayMs);
    logger.info('Global claim indexer scheduled', { initialDelayMs: this.initialDelayMs });
  }

  schedule(delayMs) {
    if (this.stopped) return;
    this.timer = setTimeout(() => { this.tick(); }, Math.max(1000, delayMs));
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
  }

  async tick() {
    if (this.stopped) return;
    if (this.running) {
      logger.warn('Global claim indexer tick skipped; previous run is still in progress');
    } else {
      this.running = true;
      try {
        await this.service.run();
      } catch (error) {
        logger.error('Global claim indexer run crashed', error);
      } finally {
        this.running = false;
      }
    }

    let seconds = DEFAULT_INTERVAL_SECONDS;
    try {
      seconds = await this.service.getNumber(SETTING_KEYS.intervalSeconds, DEFAULT_INTERVAL_SECONDS);
    } catch (error) {
      logger.warn('Global claim indexer interval could not be loaded; using default', { error: error.message });
    }
    if (!Number.isFinite(seconds) || seconds < 1) seconds = DEFAULT_INTERVAL_SECONDS;
    this.schedule(seconds * SECOND_MS);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { ClaimIndexerRunner };
