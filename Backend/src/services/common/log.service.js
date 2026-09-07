const fs = require('node:fs');
const path = require('node:path');
const { env } = require('../../core/config/env');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const logsRoot = path.resolve(process.cwd(), 'public', 'logs');
const sensitiveKeys = /password|authorization|token|secret|cookie/i;

const redact = (value) => {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack, code: value.code };
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKeys.test(key) ? '[REDACTED]' : redact(item)]));
};

const serialize = (value) => {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack, code: value.code };
  return redact(value);
};

const write = (level, message, context = {}) => {
  if ((levels[level] ?? 2) > (levels[env.logging.level] ?? 2)) return;
  const timestamp = new Date().toISOString();
  const entry = JSON.stringify({ timestamp, level, message, context: serialize(context) });
  const folder = path.join(logsRoot, timestamp.slice(0, 10));
  fs.mkdirSync(folder, { recursive: true });
  fs.appendFile(path.join(folder, `${level}.log`), `${entry}\n`, () => {});
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  output(entry);
};

const logger = {
  error: (message, context) => write('error', message, context),
  warn: (message, context) => write('warn', message, context),
  info: (message, context) => write('info', message, context),
  debug: (message, context) => write('debug', message, context),
};

const cleanupOldLogs = () => {
  if (!fs.existsSync(logsRoot)) return;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - env.logging.retentionDays);
  const cutoffName = cutoff.toISOString().slice(0, 10);
  for (const entry of fs.readdirSync(logsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name) && entry.name < cutoffName) {
      fs.rmSync(path.join(logsRoot, entry.name), { recursive: true, force: true });
    }
  }
};

module.exports = { logger, redact, cleanupOldLogs };
