import { useQuery } from '@tanstack/react-query';
import { tokenApi } from '@/api/tokens';
import { ROLES } from '@/config/permissions';
import { web3Config } from '@/config/web3';
import { useAuthStore } from '@/store/auth.store';
import { networkUserKey, useNetworkStore } from '@/store/network.store';

const normalizeStatus = (status) =>
  String(status || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const firstText = (...values) =>
  String(values.find((value) => value !== undefined && value !== null) || '').trim();

const isExpectedOrganizationTokenPrerequisiteError = (error) => {
  const status = error?.response?.status;
  const data = error?.response?.data || {};
  const code = String(data?.error?.code || data?.code || '').toUpperCase();
  const message = String(data?.message || error?.message || '');

  return (
    (
      status === 400 &&
      code === 'BAD_REQUEST' &&
      /create and submit an organization before creating a token/i.test(message)
    ) ||
    (
      status === 409 &&
      code === 'CONFLICT' &&
      /organization must be approved before token creation can begin/i.test(message)
    )
  );
};

export const getTokenRecordUid = (token) =>
  firstText(token?.tokenUid, token?.tokenUID, token?.uid, token?.id);

export const getTokenRecordStatus = (token) => firstText(token?.status, 'draft');

export const getTokenRecordChainId = (token) => {
  const information = token?.tokenInformation || token?.information || token || {};
  const candidates = [
    token?.chainId,
    token?.networkChainId,
    token?.deployment?.chainId,
    token?.deployment?.networkChainId,
    token?.chain?.chainId,
    token?.network?.chainId,
    information?.chainId,
    information?.networkChainId,
    information?.chain?.chainId,
    information?.network?.chainId,
  ];

  for (const value of candidates) {
    const chainId = Number(value);
    if (Number.isSafeInteger(chainId) && chainId > 0) return chainId;
  }
  return null;
};

export const getTokenRecordChainUid = (token) => {
  const information = token?.tokenInformation || token?.information || token || {};
  return firstText(
    token?.chainUid,
    token?.deployment?.chainUid,
    token?.chain?.chainUid,
    token?.network?.chainUid,
    information?.chainUid,
    information?.chain?.chainUid,
    information?.network?.chainUid,
  );
};

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

export const myTokenQueryKey = (userKey = 'current-user', chainUid = 'unselected') => [
  'tokens',
  'me',
  userKey,
  String(chainUid || 'unselected'),
];

export function useMyToken({ enabled = true } = {}) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userKey = user?.userUid || user?.uid || user?.email || 'current-user';
  const networkKey = networkUserKey(user);
  const selectedChainId = useNetworkStore((state) => state.activeChainByUser[networkKey] || null);
  const storedChainUid = useNetworkStore((state) => state.activeChainUidByUser[networkKey] || '');
  const selectedChainUid =
    storedChainUid || web3Config.getChainRecordById(selectedChainId)?.chainUid || '';
  const canLoad =
    enabled &&
    isAuthenticated &&
    user?.role === ROLES.issuer &&
    Boolean(selectedChainUid);

  const query = useQuery({
    queryKey: myTokenQueryKey(userKey, selectedChainUid),
    queryFn: async () => {
      try {
        return await tokenApi.getMyToken();
      } catch (error) {
        if (error?.response?.status === 404) return null;
        if (isExpectedOrganizationTokenPrerequisiteError(error)) {
          // The shared layout asks for the issuer token while organization onboarding is
          // still in progress. These prerequisite responses are expected at login, so keep
          // the query error semantics for guards/diagnostics without showing a scary toast.
          error.__skipGlobalErrorToast = true;
        }
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
    selectedChainUid,
  };
}
