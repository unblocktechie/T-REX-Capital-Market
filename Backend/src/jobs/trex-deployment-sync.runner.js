const { logger } = require('../services/common/log.service');
const { SETTING_KEYS } = require('../services/blockchain/trex-deployment-sync.service');

const MINUTE_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 60;

// Self-rescheduling in-process scheduler for the TREX deployment sync service.
// Reads the interval from General Settings before scheduling each next run, guards
// against overlapping executions, and never blocks process shutdown (unref'd timer).
class TrexDeploymentSyncRunner {
  constructor(service, { initialDelayMs = 15000 } = {}) {
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
    logger.info('TREX deployment sync runner scheduled', { initialDelayMs: this.initialDelayMs });
  }

  schedule(delayMs) {
    if (this.stopped) return;
    this.timer = setTimeout(() => { this.tick(); }, Math.max(1000, delayMs));
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
  }

  async tick() {
    if (this.stopped) return;

    if (this.running) {
      logger.warn('TREX deployment sync tick skipped; previous run still in progress');
    } else {
      this.running = true;
      try {
        await this.service.run();
      } catch (error) {
        logger.error('TREX deployment sync run crashed', error);
      } finally {
        this.running = false;
      }
    }

    // Always read the interval fresh so operators can retune it without a restart.
    let minutes = DEFAULT_INTERVAL_MINUTES;
    try {
      minutes = await this.service.getNumber(SETTING_KEYS.interval, DEFAULT_INTERVAL_MINUTES);
    } catch (error) {
      logger.warn('TREX deployment sync: could not read interval; using default', { error: error.message });
    }
    if (!Number.isFinite(minutes) || minutes < 1) minutes = DEFAULT_INTERVAL_MINUTES;

    this.schedule(minutes * MINUTE_MS);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = { TrexDeploymentSyncRunner };
