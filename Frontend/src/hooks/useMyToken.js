import { useQuery } from '@tanstack/react-query';
import { tokenApi } from '@/api/tokens';
import { ROLES } from '@/config/permissions';
import { useAuthStore } from '@/store/auth.store';

const normalizeStatus = (status) =>
  String(status || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const firstText = (...values) =>
  String(values.find((value) => value !== undefined && value !== null) || '').trim();

export const getTokenRecordUid = (token) =>
  firstText(token?.tokenUid, token?.tokenUID, token?.uid, token?.id);

export const getTokenRecordStatus = (token) => firstText(token?.status, 'draft');

export const isTokenRecordLocked = (token) =>
  [
    'readytodeploy',
    'deploymentpending',
    'deploymentconfirmed',
    'deploymentfailed',
    'configurationpending',
    'configurationfailed',
    'priceconfirmationrequired',
    'deployed',
    'completed',
    'active',
  ].includes(normalizeStatus(getTokenRecordStatus(token)));

export const getTokenRecordName = (token) => {
  const information = token?.tokenInformation || token?.information || token || {};
  return firstText(information?.tokenName, information?.name, token?.tokenName, token?.name);
};

export const getTokenRecordSymbol = (token) => {
  const information = token?.tokenInformation || token?.information || token || {};
  return firstText(
    information?.tokenSymbol,
    information?.symbol,
    token?.tokenSymbol,
    token?.symbol,
  ).toUpperCase();
};

export const myTokenQueryKey = (userKey = 'current-user') => [
  'tokens',
  'me',
  userKey,
];

export function useMyToken({ enabled = true } = {}) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userKey = user?.userUid || user?.uid || user?.email || 'current-user';
  const canLoad = enabled && isAuthenticated && user?.role === ROLES.issuer;

  const query = useQuery({
    queryKey: myTokenQueryKey(userKey),
    queryFn: async () => {
      try {
        return await tokenApi.getMyToken();
      } catch (error) {
        if (error?.response?.status === 404) return null;
        throw error;
      }
    },
    enabled: canLoad,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: (failureCount, error) => {
      if ([400, 401, 403, 404].includes(error?.response?.status)) return false;
      return failureCount < 1;
    },
  });

  const token = query.data || null;
  const tokenUid = getTokenRecordUid(token);
  const status = getTokenRecordStatus(token);
  const isLocked = isTokenRecordLocked(token);
  const normalizedStatus = normalizeStatus(status);

  return {
    ...query,
    token,
    tokenUid,
    status,
    isLocked,
    isReadyToDeploy: normalizedStatus === 'readytodeploy',
    isDeploymentPending: [
      'deploymentpending',
      'deploymentconfirmed',
      'configurationpending',
      'priceconfirmationrequired',
    ].includes(normalizedStatus),
    isDeploymentConfirmed: normalizedStatus === 'deploymentconfirmed',
    isConfigurationPending: normalizedStatus === 'configurationpending',
    isConfigurationFailed: normalizedStatus === 'configurationfailed',
    isPriceConfirmationRequired: normalizedStatus === 'priceconfirmationrequired',
    isDeploymentFailed: normalizedStatus === 'deploymentfailed',
    isDeployed: ['deployed', 'completed', 'active'].includes(normalizedStatus),
    hasToken: Boolean(tokenUid || getTokenRecordName(token)),
    userKey,
  };
}
