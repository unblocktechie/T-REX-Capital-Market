const crypto = require('node:crypto');
const { env } = require('../core/config/env');

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const encryptionKey = () => {
  // The root key deliberately remains outside MySQL. JWT_SECRET is retained as a
  // development compatibility fallback; production must configure the dedicated key.
  if (env.nodeEnv === 'production' && !env.chainSecrets?.encryptionKey) {
    throw new Error('CHAIN_SECRET_ENCRYPTION_KEY is required in production.');
  }
  const secret = env.chainSecrets?.encryptionKey || env.jwt.secret;
  if (!secret || String(secret).length < 32) {
    throw new Error('CHAIN_SECRET_ENCRYPTION_KEY must contain at least 32 characters.');
  }
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
};

const encryptSecret = (plaintext) => {
  if (plaintext === undefined || plaintext === null || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
};

const decryptSecret = (payload) => {
  if (!payload) return null;
  const [version, ivValue, tagValue, encryptedValue] = String(payload).split(':');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored chain secret is not in a supported encrypted format.');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = { encryptSecret, decryptSecret };
