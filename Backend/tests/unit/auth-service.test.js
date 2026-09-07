const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../../src/services/auth.service');

const createService = (user) => new AuthService({
  userRepository: { findByEmail: async () => user },
  roleRepository: {},
  authTokenRepository: {},
  emailService: {},
});

test('forgot password rejects an unregistered email with signup guidance', async () => {
  await assert.rejects(
    createService(null).forgotPassword('missing@example.com'),
    (error) => error.statusCode === 404
      && error.code === 'NOT_FOUND'
      && error.message === 'This email is not registered. Please sign up first.',
  );
});

test('forgot password rejects an inactive registered account', async () => {
  await assert.rejects(
    createService({ userUid: 'user-1', isActive: false }).forgotPassword('inactive@example.com'),
    (error) => error.statusCode === 403 && error.code === 'FORBIDDEN',
  );
});
