const crypto = require('node:crypto');

const createOpaqueToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createUid = () => crypto.randomUUID();

module.exports = { createOpaqueToken, hashToken, createUid };
