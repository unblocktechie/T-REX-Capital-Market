const { logger } = require('../services/common/log.service');
const { REDEMPTION_SETTING_KEYS, REDEMPTION_DEFAULTS } = require('../services/blockchain/token-redemption-reconciliation.service');

class TokenRedemptionReconciliationRunner {
  constructor(service, { initialDelayMs = 12000 } = {}) {
    this.service = service; this.initialDelayMs = initialDelayMs;
    this.timer = null; this.running = false; this.stopped = false;
  }

  start() {
    this.stopped = false; this.schedule(this.initialDelayMs);
    logger.info('Token redemption reconciliation runner scheduled', { initialDelayMs: this.initialDelayMs });
  }

  schedule(ms) {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick(), Math.max(1000, ms));
    if (this.timer.unref) this.timer.unref();
  }

  async tick() {
    if (!this.stopped && !this.running) {
      this.running = true;
      try { await this.service.run(); } catch (error) { logger.error('Token redemption reconciliation crashed', error); }
      finally { this.running = false; }
    }
    let seconds = REDEMPTION_DEFAULTS.intervalSeconds;
    try { seconds = await this.service.getNumber(REDEMPTION_SETTING_KEYS.intervalSeconds, seconds); } catch {}
    this.schedule(seconds * 1000);
  }

  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
}

module.exports = { TokenRedemptionReconciliationRunner };
