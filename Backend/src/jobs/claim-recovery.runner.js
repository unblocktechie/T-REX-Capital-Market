const { logger } = require('../services/common/log.service');

const SECOND_MS = 1000;
const DEFAULT_INTERVAL_SECONDS = 15;

// Self-rescheduling in-process scheduler for the investor claim recovery service. Mirrors the
// TREX deployment sync runner: reads the interval from General Settings before each next run,
// guards against overlapping executions, and never blocks process shutdown (unref'd timer).
class ClaimRecoveryRunner {
  constructor(service, { initialDelayMs = 20000 } = {}) {
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
    logger.info('Claim recovery runner scheduled', { initialDelayMs: this.initialDelayMs });
  }

  schedule(delayMs) {
    if (this.stopped) return;
    this.timer = setTimeout(() => { this.tick(); }, Math.max(1000, delayMs));
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
  }

  async tick() {
    if (this.stopped) return;

    if (this.running) {
      logger.warn('Claim recovery tick skipped; previous run still in progress');
    } else {
      this.running = true;
      try {
        await this.service.run();
      } catch (error) {
        logger.error('Claim recovery run crashed', error);
      } finally {
        this.running = false;
      }
    }

    // Always read the interval fresh so operators can retune it without a restart.
    let seconds = DEFAULT_INTERVAL_SECONDS;
    try {
      seconds = await this.service.getNumber('ClaimRecoveryIntervalSeconds', DEFAULT_INTERVAL_SECONDS);
    } catch (error) {
      logger.warn('Claim recovery: could not read interval; using default', { error: error.message });
    }
    if (!Number.isFinite(seconds) || seconds < 1) seconds = DEFAULT_INTERVAL_SECONDS;

    this.schedule(seconds * SECOND_MS);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = { ClaimRecoveryRunner };
