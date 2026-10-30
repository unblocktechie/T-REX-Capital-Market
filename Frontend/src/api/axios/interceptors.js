import { apiClient } from './axios.instance';
import { HTTP_STATUS, TOKEN_TYPES } from '@/constants';
import { ROUTES } from '@/config/routes';
import { authRedirectService } from '@/services/auth-redirect.service';
import { tokenService } from '@/services/token.service';
import { useAuthStore } from '@/store/auth.store';
import { useNetworkStore } from '@/store/network.store';
import { useUiStore } from '@/store/ui.store';
import { web3Config } from '@/config/web3';
import { queryClient } from '@/lib/queryClient';
import { getRetryDelayMs, wait } from '@/utils/retry';

let interceptorIds = null;
let authNotFoundRedirectInProgress = false;

// A 429 means the backend is already protecting itself. Retrying the same
// browser burst automatically makes chain-switch storms worse, so requests do
// not retry rate-limit responses unless a caller explicitly opts in.
const RATE_LIMIT_MAX_RETRIES = 0;

const retryRateLimitedRequest = async (error) => {
  const config = error?.config;
  if (!config || Number(error?.response?.status) !== 429 || config.signal?.aborted) return null;

  const retryCount = Number(config.__rateLimitRetryCount || 0);
  const maxRetries = Number(config.rateLimitMaxRetries ?? RATE_LIMIT_MAX_RETRIES);
  if (retryCount >= maxRetries) {
    error.__retryExhausted = retryCount > 0;
    error.__retryAttempts = retryCount + 1;
    return null;
  }

  const delayMs = getRetryDelayMs(error, retryCount + 1, {
    baseDelayMs: 800,
    maxDelayMs: 10_000,
  });
  config.__rateLimitRetryCount = retryCount + 1;
  await wait(delayMs, config.signal);
  return apiClient.request(config);
};

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

const requestPath = (url = '') => String(url || '').split('?')[0];

const isInvestorChainScopedRequest = (url = '') => {
  const path = requestPath(url);
  return (
    path === '/investors' ||
    path.startsWith('/investors/') ||
    path === '/investments' ||
    path.startsWith('/investments/') ||
    path === '/investor/claims' ||
    path.startsWith('/investor/claims/')
  );
};

const isIssuerChainScopedRequest = (url = '') => {
  const path = requestPath(url);
  return (
    path === '/organizations' ||
    path.startsWith('/organizations/') ||
    path === '/tokens' ||
    path.startsWith('/tokens/') ||
    path === '/investments' ||
    path.startsWith('/investments/') ||
    path === '/issuer/claims' ||
    path.startsWith('/issuer/claims/')
  );
};

const shouldAttachSelectedChain = (role, url = '') => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'issuer') return isIssuerChainScopedRequest(url);
  if (normalizedRole === 'investor') return isInvestorChainScopedRequest(url);
  return false;
};

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

const BACKGROUND_READ_METHODS = new Set(['get', 'head', 'options']);

/**
 * Page reads inside an authenticated session should be represented by the
 * destination page's skeleton/inline state, not by a second full-screen loader.
 * Mutations and public/auth flows keep the existing global-loader behavior.
 * A caller can still opt in explicitly with `forceGlobalLoader: true`.
 */
const shouldTrackGlobalLoader = (config = {}) => {
  if (config.skipGlobalLoader) return false;
  if (config.forceGlobalLoader) return true;

  const method = String(config.method || 'get').trim().toLowerCase();
  const isAuthenticated = Boolean(useAuthStore.getState().isAuthenticated);
  if (isAuthenticated && BACKGROUND_READ_METHODS.has(method)) return false;

  return true;
};

const SELECTED_CHAIN_RESET_CODES = new Set(['INVALID_SELECTED_CHAIN', 'CHAIN_NOT_FOUND']);

const responseErrorCode = (error) => String(
  error?.response?.data?.code || error?.response?.data?.error?.code || '',
).trim().toUpperCase();

const recoverInvalidSelectedChain = (error) => {
  const code = responseErrorCode(error);
  if (!SELECTED_CHAIN_RESET_CODES.has(code)) return;

  const user = useAuthStore.getState().user;
  if (!user || !shouldAttachSelectedChain(user?.role || user?.roleName, error?.config?.url)) return;

  const networkState = useNetworkStore.getState();
  const cleared = networkState.clearActiveChainId(user);
  if (!cleared) return;

  queryClient.removeQueries({
    predicate: (query) => {
      const root = String(Array.isArray(query.queryKey) ? query.queryKey[0] || '' : '');
      return [
        'dashboard',
        'investor',
        'investments',
        'marketplace',
        'portfolio',
        'transactions',
        'payment-tokens',
        'token-image',
        'sidebar-action-indicators',
        'organization',
        'tokens',
        'token-issuance',
      ].includes(root);
    },
  });
  queryClient.invalidateQueries({ queryKey: ['chains', 'public'] });
  queryClient.invalidateQueries({ queryKey: ['chains', 'me'] });
};

export const setupAxiosInterceptors = () => {
  if (interceptorIds) return interceptorIds;

  const requestId = apiClient.interceptors.request.use(
    (config) => {
      if (shouldTrackGlobalLoader(config)) {
        useUiStore.getState().beginRequest();
        config.__tracksGlobalLoader = true;
      }

      const token = tokenService.getAccessToken();
      if (token && !isPublicAuthRequest(config.url)) {
        config.headers.Authorization = `${TOKEN_TYPES.bearer} ${token}`;

        const user = useAuthStore.getState().user;
        const normalizedRole = String(user?.role || user?.roleName || '').trim().toLowerCase();
        if (normalizedRole === 'investor' || normalizedRole === 'issuer') {
          const networkState = useNetworkStore.getState();
          const selectedChainUid =
            networkState.getActiveChainUid(user) ||
            web3Config.getChainRecordById(networkState.getActiveChainId(user))?.chainUid ||
            '';
          if (selectedChainUid) config.headers['X-Chain-Uid'] = selectedChainUid;
        }
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
    async (error) => {
      finishTrackedRequest(error.config);
      const retriedResponse = await retryRateLimitedRequest(error);
      if (retriedResponse) return retriedResponse;

      recoverInvalidSelectedChain(error);

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
          authRedirectService.navigate(`${ROUTES.signup}?reason=account-not-found`, { replace: true });
          window.setTimeout(() => { authNotFoundRedirectInProgress = false; }, 500);
        }
      }

      if (isUnauthorized && hadSession && !isPublicRequest) {
        useAuthStore.getState().clearSession();
        queryClient.clear();
        const currentPath = window.location.pathname;
        if (currentPath !== ROUTES.login) {
          authRedirectService.navigate(`${ROUTES.login}?reason=session-expired`, { replace: true });
        }
      }

      return Promise.reject(error);
    },
  );

  interceptorIds = { requestId, responseId };
  return interceptorIds;
};
