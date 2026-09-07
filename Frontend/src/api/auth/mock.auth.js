import { ROLE_PERMISSIONS, ROLES } from '@/config/permissions';

const wait = (ms = 650) => new Promise((resolve) => setTimeout(resolve, ms));

const mockUser = {
  id: 'usr_01HZX9K5G8',
  name: 'Alex Morgan',
  email: 'demo@trexcapitalmarket.dev',
  role: ROLES.admin,
  permissions: ROLE_PERMISSIONS[ROLES.admin],
  avatar: '',
  company: 'Riverside Capital',
};

export const mockAuthApi = {
  async login(payload) {
    await wait();
    if (!payload.email || !payload.password) throw new Error('Email and password are required.');
    return { user: { ...mockUser, email: payload.email }, accessToken: 'mock-access-token' };
  },
  async register(payload) {
    await wait(850);
    return {
      message: 'Account created. Please verify your email.',
      email: payload.email,
      role: payload.role,
    };
  },
  async verifyEmail() {
    await wait();
    return { message: 'Email verified successfully.' };
  },
  async resendOtp() {
    await wait(450);
    return { message: 'A new verification code has been sent.' };
  },
  async forgotPassword() {
    await wait();
    return { message: 'Password reset instructions have been sent.' };
  },
  async resetPassword() {
    await wait();
    return { message: 'Password reset successfully.' };
  },
  async logout() {
    await wait(250);
    return { success: true };
  },
  async me() {
    await wait(250);
    return mockUser;
  },
};
