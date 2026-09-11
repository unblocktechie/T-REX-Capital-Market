const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOrigin, csvOrigins } = require('../../src/core/config/env');

test('CORS origins are normalized without trailing slashes', () => {
  assert.equal(normalizeOrigin('https://trex.unblocktechnolabs.com/'), 'https://trex.unblocktechnolabs.com');
  assert.deepEqual(
    csvOrigins('https://trex.unblocktechnolabs.com/, http://localhost:3001, https://trex.unblocktechnolabs.com'),
    ['https://trex.unblocktechnolabs.com', 'http://localhost:3001'],
  );
});
