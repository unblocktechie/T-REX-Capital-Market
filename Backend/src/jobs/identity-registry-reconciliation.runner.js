const { logger } = require('../services/common/log.service');
const { SETTING_KEYS, DEFAULTS } = require('../services/blockchain/identity-registry-reconciliation.service');

class IdentityRegistryReconciliationRunner {
  constructor(service, { initialDelayMs = 15000 } = {}) {
    this.service = service;
    this.initialDelayMs = initialDelayMs;
    this.timer = null;
    this.running = false;
    this.stopped = false;
  }

  start() {
    this.stopped = false;
    this.schedule(this.initialDelayMs);
    logger.info('Identity Registry reconciliation runner scheduled', { initialDelayMs: this.initialDelayMs });
  }

  schedule(delayMs) {
    if (this.stopped) return;
    this.timer = setTimeout(() => { this.tick(); }, Math.max(1000, delayMs));
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  async tick() {
    if (this.stopped) return;
    if (this.running) {
      logger.warn('Identity Registry reconciliation tick skipped; previous run is still active');
    } else {
      this.running = true;
      try { await this.service.run(); } catch (error) { logger.error('Identity Registry reconciliation crashed', error); }
      finally { this.running = false; }
    }
    let seconds = DEFAULTS.intervalSeconds;
    try { seconds = await this.service.getNumber(SETTING_KEYS.intervalSeconds, DEFAULTS.intervalSeconds); } catch {}
    this.schedule(Math.max(1, seconds) * 1000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { IdentityRegistryReconciliationRunner };
