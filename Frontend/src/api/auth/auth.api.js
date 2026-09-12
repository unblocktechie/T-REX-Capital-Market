import { apiClient } from '@/api/axios';
import { AUTH_ENDPOINTS } from './auth.endpoints';

const unwrap = (response) => response.data?.data ?? response.data;

export const authApi = {
  login: (payload) => apiClient.post(AUTH_ENDPOINTS.login, payload).then(unwrap),

  register: ({ name, fullName, email, password, role, isIssuer }) =>
    apiClient
      .post(AUTH_ENDPOINTS.signup, {
        fullName: fullName || name,
        email,
        password,
        isIssuer: typeof isIssuer === 'boolean' ? isIssuer : role === 'issuer',
      })
      .then(unwrap),

  completePrivySignup: ({ email, identityToken }) =>
    apiClient.post(AUTH_ENDPOINTS.completePrivySignup, { email, identityToken }).then(unwrap),

  forgotPassword: ({ email }) =>
    apiClient.post(AUTH_ENDPOINTS.forgotPassword, { email }).then(unwrap),

  verifyResetToken: async ({ token }) => {
    const data = await apiClient
      .get(AUTH_ENDPOINTS.verifyResetToken, { params: { token }, skipGlobalLoader: true })
      .then(unwrap);
    if (data?.valid !== true) throw new Error('This password reset link is invalid or expired.');
    return data;
  },

  resetPassword: ({ token, password, newPassword }) =>
    apiClient
      .post(AUTH_ENDPOINTS.resetPassword, {
        token,
        newPassword: newPassword || password,
      })
      .then(unwrap),
};
