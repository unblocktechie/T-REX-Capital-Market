import { apiClient } from './axios.instance';
import { HTTP_STATUS, TOKEN_TYPES } from '@/constants';
import { ROUTES } from '@/config/routes';
import { authRedirectService } from '@/services/auth-redirect.service';
import { tokenService } from '@/services/token.service';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { queryClient } from '@/lib/queryClient';

let interceptorIds = null;
let authNotFoundRedirectInProgress = false;

const PUBLIC_AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/signup',
  '/auth/resend-verification',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/verify-reset-token',
  '/auth/reset-password',
];

const ACCOUNT_LOOKUP_ENDPOINTS = [
  ['/auth/login', 'login'],
  ['/auth/forgot-password', 'forgot-password'],
  ['/auth/resend-verification', 'resend-verification'],
  ['/auth/verify-email', 'verify-email'],
  ['/auth/verify-reset-token', 'verify-reset-token'],
  ['/auth/reset-password', 'reset-password'],
];

const isPublicAuthRequest = (url = '') =>
  PUBLIC_AUTH_ENDPOINTS.some((endpoint) => String(url).includes(endpoint));

const getAccountLookupSource = (url = '') =>
  ACCOUNT_LOOKUP_ENDPOINTS.find(([endpoint]) => String(url).includes(endpoint))?.[1] || null;

const getRequestEmail = (config = {}) => {
  if (config.params?.email) return String(config.params.email);

  const payload = config.data;
  if (!payload) return '';

  if (typeof FormData !== 'undefined' && payload instanceof FormData) {
    return String(payload.get('email') || '');
  }

  if (typeof payload === 'object') return String(payload.email || '');

  if (typeof payload === 'string') {
    try {
      return String(JSON.parse(payload)?.email || '');
    } catch {
      return '';
    }
  }

  return '';
};

const getResponseMessage = (error) => {
  const payload = error?.response?.data;
  return String(
    payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ||
      '',
  );
};

const isEmailVerificationRequiredLoginError = (error) => {
  const isLoginRequest = String(error?.config?.url || '').includes('/auth/login');
  const isForbidden = error?.response?.status === HTTP_STATUS.forbidden;
  const message = getResponseMessage(error);

  return (
    isLoginRequest &&
    isForbidden &&
    /(?:verify|verification).*email|email.*(?:verify|verification)/i.test(message)
  );
};

const finishTrackedRequest = (config) => {
  if (config?.__tracksGlobalLoader) useUiStore.getState().endRequest();
};

export const setupAxiosInterceptors = () => {
  if (interceptorIds) return interceptorIds;

  const requestId = apiClient.interceptors.request.use(
    (config) => {
      if (!config.skipGlobalLoader) {
        useUiStore.getState().beginRequest();
        config.__tracksGlobalLoader = true;
      }

      const token = tokenService.getAccessToken();
      if (token && !isPublicAuthRequest(config.url)) {
        config.headers.Authorization = `${TOKEN_TYPES.bearer} ${token}`;
      }

      if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        if (typeof config.headers?.delete === 'function') config.headers.delete('Content-Type');
        else if (config.headers) delete config.headers['Content-Type'];
      }

      return config;
    },
    (error) => {
      finishTrackedRequest(error.config);
      return Promise.reject(error);
    },
  );

  const responseId = apiClient.interceptors.response.use(
    (response) => {
      finishTrackedRequest(response.config);
      return response;
    },
    (error) => {
      finishTrackedRequest(error.config);

      const status = error.response?.status;
      const hadSession =
        Boolean(tokenService.getAccessToken()) || useAuthStore.getState().isAuthenticated;
      const isUnauthorized = status === HTTP_STATUS.unauthorized;
      const isNotFound = status === HTTP_STATUS.notFound;
      const isPublicRequest = isPublicAuthRequest(error.config?.url);
      const accountLookupSource = getAccountLookupSource(error.config?.url);
      const emailVerificationRequired = isEmailVerificationRequiredLoginError(error);

      if (emailVerificationRequired) {
        // The login page redirects to the verification screen and owns the user-facing recovery UI.
        // Suppress the generic red error toast for this expected account state.
        error.__skipGlobalErrorToast = true;
      }

      if (
        isNotFound &&
        isPublicRequest &&
        accountLookupSource &&
        window.location.pathname !== ROUTES.signup
      ) {
        // The signup page owns the user-facing message after this redirect.
        error.__skipGlobalErrorToast = true;

        if (!authNotFoundRedirectInProgress) {
          authNotFoundRedirectInProgress = true;
          authRedirectService.setAccountNotFoundContext({
            source: accountLookupSource,
            email: getRequestEmail(error.config),
          });
          window.location.assign(`${ROUTES.signup}?reason=account-not-found`);
        }
      }

      if (isUnauthorized && hadSession && !isPublicRequest) {
        useAuthStore.getState().clearSession();
        queryClient.clear();
        const currentPath = window.location.pathname;
        if (currentPath !== ROUTES.login) {
          window.location.assign(`${ROUTES.login}?reason=session-expired`);
        }
      }

      return Promise.reject(error);
    },
  );

  interceptorIds = { requestId, responseId };
  return interceptorIds;
};
