const { logger } = require('../services/common/log.service');
class VerificationTeamNotificationRunner {
  constructor(service) { this.service = service; this.stopped = true; }
  start() { this.stopped = false; this.schedule(1000); }
  schedule(ms) { if (!this.stopped) { this.timer = setTimeout(() => this.tick(), ms); this.timer.unref(); } }
  async tick() {
    try { await this.service.run(); } catch (error) { logger.error('Team notification delivery failed', error); }
    this.schedule(60000);
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
module.exports = { VerificationTeamNotificationRunner };
