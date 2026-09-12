const { sendSuccess } = require('../../../utils/response');

const createAuthController = (authService) => ({
  signup: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Account saved. Complete the Privy email OTP to activate the account and create its wallet.',
    data: await authService.signup(req.body),
  }),
  completePrivySignup: async (req, res) => sendSuccess(req, res, {
    message: 'Privy email verified, wallet linked, and login successful.',
    data: await authService.completeSignup(req.body.email, req.body.identityToken),
  }),
  login: async (req, res) => {
    const data = await authService.login(req.body.email, req.body.password, req.body.identityToken);
    return sendSuccess(req, res, {
      message: data?.privyVerificationRequired
        ? 'Password accepted. Complete Privy email verification to continue.'
        : 'Login successful.',
      data,
    });
  },
  forgotPassword: async (req, res) => {
    await authService.forgotPassword(req.body.email);
    return sendSuccess(req, res, { message: 'A password reset link has been sent to your registered email.' });
  },
  verifyResetToken: async (req, res) => {
    await authService.verifyResetToken(req.query.token);
    return sendSuccess(req, res, { message: 'Password reset token is valid.', data: { valid: true } });
  },
  resetPassword: async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.newPassword);
    return sendSuccess(req, res, { message: 'Password reset successfully. You can now log in with your new password.' });
  },
});

module.exports = { createAuthController };
