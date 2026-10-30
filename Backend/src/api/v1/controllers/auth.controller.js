const { sendSuccess } = require('../../../utils/response');

const createAuthController = (authService) => ({
  signup: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Account created. Please check your email to verify your account.',
    data: await authService.signup(req.body),
  }),
  resendVerification: async (req, res) => {
    const result = await authService.resendVerification(req.body.email);
    if (result.status === 'ALREADY_VERIFIED') {
      return sendSuccess(req, res, {
        message: 'User is already verified. You can log in.',
        data: result,
      });
    }
    return sendSuccess(req, res, {
      message: 'If the account is eligible, a verification email has been sent.',
    });
  },
  verifyEmail: async (req, res) => sendSuccess(req, res, {
    message: 'Email verified and login successful.', data: await authService.verifyEmail(req.body.token),
  }),
  login: async (req, res) => sendSuccess(req, res, {
    message: 'Login successful.', data: await authService.login(req.body.email, req.body.password),
  }),
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
