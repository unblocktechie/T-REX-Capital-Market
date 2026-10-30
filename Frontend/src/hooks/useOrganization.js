import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enrichOrganizationLabels,
  mapOrganization,
  mapOrganizationDocument,
  mapOrganizationOptions,
  organizationApi,
  toBeneficialOwnersPayload,
  toCompanyPayload,
  toJurisdictionPayload,
} from '@/api/organization';
import { ROLES } from '@/config/permissions';
import { web3Config } from '@/config/web3';
import {
  ORGANIZATION_STATUSES,
  createInitialOrganization,
} from '@/services/organizationStorageService';
import { organizationUiStateService } from '@/services/organizationUiStateService';
import { useAuthStore } from '@/store/auth.store';
import { networkUserKey, useNetworkStore } from '@/store/network.store';

export const organizationQueryKey = Object.freeze(['organization', 'me']);
export const organizationChainQueryKey = (chainUid = 'unselected') => [
  ...organizationQueryKey,
  String(chainUid || 'unselected'),
];
const organizationOptionsQueryKey = Object.freeze(['organization', 'options']);

const withOwnerRelationships = (organization, sourceOwners = []) => ({
  ...organization,
  beneficialOwners: organization.beneficialOwners.map((owner, index) => ({
    ...owner,
    relationship:
      sourceOwners[index]?.relationship || owner.relationship || '',
  })),
});

export function useOrganization({ enabled: queryEnabled = true } = {}) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const userKey = networkUserKey(user);
  const selectedChainId = useNetworkStore((state) => state.activeChainByUser[userKey] || null);
  const storedChainUid = useNetworkStore((state) => state.activeChainUidByUser[userKey] || '');
  const selectedChainUid =
    storedChainUid || web3Config.getChainRecordById(selectedChainId)?.chainUid || '';
  const selectedOrganizationQueryKey = useMemo(
    () => organizationChainQueryKey(selectedChainUid),
    [selectedChainUid],
  );
  const enabled =
    queryEnabled && isAuthenticated && role === ROLES.issuer && Boolean(selectedChainUid);

  const getOptions = useCallback(
    () =>
      queryClient.ensureQueryData({
        queryKey: organizationOptionsQueryKey,
        queryFn: async () => mapOrganizationOptions(await organizationApi.getOptions()),
        staleTime: 30 * 60_000,
      }),
    [queryClient, selectedOrganizationQueryKey],
  );

  const mapWithLabels = useCallback(
    (serverOrganization) =>
      enrichOrganizationLabels(
        mapOrganization(serverOrganization),
        queryClient.getQueryData(organizationOptionsQueryKey),
      ),
    [queryClient, selectedOrganizationQueryKey],
  );

  const loadOrganization = useCallback(async () => {
    const [serverOrganization, serverOptions] = await Promise.all([
      organizationApi.getMyOrganization(),
      getOptions(),
    ]);
    return enrichOrganizationLabels(mapOrganization(serverOrganization), serverOptions);
  }, [getOptions]);

  const query = useQuery({
    queryKey: selectedOrganizationQueryKey,
    queryFn: loadOrganization,
    enabled,
    staleTime: 15_000,
  });

  const organization = useMemo(
    () => query.data || createInitialOrganization(),
    [query.data],
  );

  const setOrganization = useCallback(
    (serverOrganization) => {
      const mapped = mapWithLabels(serverOrganization);
      queryClient.setQueryData(selectedOrganizationQueryKey, mapped);
      return mapped;
    },
    [mapWithLabels, queryClient, selectedOrganizationQueryKey],
  );

  const refresh = useCallback(async () => {
    if (!selectedChainUid) {
      return queryClient.getQueryData(selectedOrganizationQueryKey) || createInitialOrganization();
    }
    const mapped = await loadOrganization();
    queryClient.setQueryData(selectedOrganizationQueryKey, mapped);
    return mapped;
  }, [loadOrganization, queryClient, selectedChainUid, selectedOrganizationQueryKey]);

  const synchronizeAfterMutation = useCallback(
    async (serverOrganization, createFallback, transformFresh) => {
      const mappedResponse = mapWithLabels(serverOrganization);
      let fallbackResult = mappedResponse;

      queryClient.setQueryData(
        selectedOrganizationQueryKey,
        (current = createInitialOrganization()) => {
          fallbackResult = createFallback(current, mappedResponse);
          return fallbackResult;
        },
      );

      try {
        const freshServerOrganization = await organizationApi.getMyOrganization();
        if (freshServerOrganization) {
          let fresh = mapWithLabels(freshServerOrganization);
          if (transformFresh) fresh = transformFresh(fresh, fallbackResult);
          queryClient.setQueryData(selectedOrganizationQueryKey, fresh);
          return fresh;
        }
      } catch {
        // The step save already succeeded. Keep the safely merged local cache and
        // allow the next regular query/refetch to retry the full synchronization.
      }

      return fallbackResult;
    },
    [mapWithLabels, queryClient, selectedOrganizationQueryKey],
  );

  const saveCompany = useCallback(
    async (company, isDraft) => {
      await queryClient.cancelQueries({ queryKey: selectedOrganizationQueryKey });
      const response = await organizationApi.saveCompanyInformation(
        toCompanyPayload(company, isDraft),
      );

      return synchronizeAfterMutation(response, (current, mapped) => ({
        ...current,
        organizationUid: mapped.organizationUid || current.organizationUid,
        backendStatus: mapped.backendStatus || current.backendStatus,
        status:
          mapped.status === ORGANIZATION_STATUSES.NOT_STARTED
            ? ORGANIZATION_STATUSES.DRAFT
            : mapped.status,
        currentStep: isDraft ? current.currentStep : Math.max(mapped.currentStep || 1, 2),
        highestStepReached: Math.max(
          Number(current.highestStepReached) || 1,
          Number(mapped.highestStepReached) || 1,
          isDraft ? 1 : 2,
        ),
        isDraft: Boolean(isDraft),
        company: {
          ...current.company,
          ...mapped.company,
          ...company,
          address: {
            ...current.company.address,
            ...mapped.company.address,
            ...company.address,
          },
        },
        // Step-specific PUT responses may omit or temporarily return empty
        // associations. Preserve all unrelated sections until GET /me confirms them.
        jurisdiction: current.jurisdiction,
        beneficialOwners: current.beneficialOwners,
        documents: current.documents,
        confirmations: current.confirmations,
      }), (fresh, fallback) => ({
        ...fresh,
        jurisdiction:
          fresh.jurisdiction.countryOfIncorporation || !fallback.jurisdiction.countryOfIncorporation
            ? fresh.jurisdiction
            : fallback.jurisdiction,
        beneficialOwners:
          fresh.beneficialOwners.length || !fallback.beneficialOwners.length
            ? fresh.beneficialOwners
            : fallback.beneficialOwners,
        documents:
          fresh.documents.length || !fallback.documents.length
            ? fresh.documents
            : fallback.documents,
      }));
    },
    [queryClient, selectedOrganizationQueryKey, synchronizeAfterMutation],
  );

  const saveJurisdiction = useCallback(
    async (jurisdiction, isDraft) => {
      await queryClient.cancelQueries({ queryKey: selectedOrganizationQueryKey });
      const response = await organizationApi.saveJurisdiction(
        toJurisdictionPayload(jurisdiction, isDraft),
      );

      return synchronizeAfterMutation(response, (current, mapped) => ({
        ...current,
        organizationUid: mapped.organizationUid || current.organizationUid,
        backendStatus: mapped.backendStatus || current.backendStatus,
        status:
          mapped.status === ORGANIZATION_STATUSES.NOT_STARTED
            ? ORGANIZATION_STATUSES.DRAFT
            : mapped.status,
        currentStep: isDraft ? current.currentStep : Math.max(mapped.currentStep || 1, 3),
        highestStepReached: Math.max(
          Number(current.highestStepReached) || 1,
          Number(mapped.highestStepReached) || 1,
          isDraft ? 2 : 3,
        ),
        isDraft: Boolean(isDraft),
        company: current.company,
        jurisdiction: {
          ...current.jurisdiction,
          ...mapped.jurisdiction,
          ...jurisdiction,
        },
        beneficialOwners: current.beneficialOwners,
        documents: current.documents,
        confirmations: current.confirmations,
      }), (fresh, fallback) => ({
        ...fresh,
        beneficialOwners:
          fresh.beneficialOwners.length || !fallback.beneficialOwners.length
            ? fresh.beneficialOwners
            : fallback.beneficialOwners,
        documents:
          fresh.documents.length || !fallback.documents.length
            ? fresh.documents
            : fallback.documents,
      }));
    },
    [queryClient, selectedOrganizationQueryKey, synchronizeAfterMutation],
  );

  const saveBeneficialOwners = useCallback(
    async (owners, isDraft) => {
      await queryClient.cancelQueries({ queryKey: selectedOrganizationQueryKey });
      const response = await organizationApi.saveBeneficialOwners(
        toBeneficialOwnersPayload(owners, isDraft),
      );

      return synchronizeAfterMutation(
        response,
        (current, mapped) => {
          const serverOwners = mapped.beneficialOwners.length
            ? mapped.beneficialOwners
            : owners;

          return withOwnerRelationships(
            {
              ...current,
              organizationUid: mapped.organizationUid || current.organizationUid,
              backendStatus: mapped.backendStatus || current.backendStatus,
              status:
                mapped.status === ORGANIZATION_STATUSES.NOT_STARTED
                  ? ORGANIZATION_STATUSES.DRAFT
                  : mapped.status,
              currentStep: isDraft
                ? current.currentStep
                : Math.max(mapped.currentStep || 1, 4),
              highestStepReached: Math.max(
                Number(current.highestStepReached) || 1,
                Number(mapped.highestStepReached) || 1,
                isDraft ? 3 : 4,
              ),
              isDraft: Boolean(isDraft),
              company: current.company,
              jurisdiction: current.jurisdiction,
              beneficialOwners: serverOwners,
              documents: current.documents,
              confirmations: current.confirmations,
            },
            owners,
          );
        },
        (fresh, fallback) =>
          withOwnerRelationships(
            {
              ...fresh,
              beneficialOwners: fresh.beneficialOwners.length
                ? fresh.beneficialOwners
                : fallback.beneficialOwners,
              documents:
                fresh.documents.length || !fallback.documents.length
                  ? fresh.documents
                  : fallback.documents,
            },
            owners,
          ),
      );
    },
    [queryClient, selectedOrganizationQueryKey, synchronizeAfterMutation],
  );

  const uploadDocuments = useCallback(
    async (documentTypeUid, files, onUploadProgress) => {
      const uploaded = await organizationApi.uploadDocuments(
        documentTypeUid,
        files,
        onUploadProgress,
      );
      const optionData = queryClient.getQueryData(organizationOptionsQueryKey);
      const mappedDocuments = enrichOrganizationLabels(
        {
          ...createInitialOrganization(),
          documents: (Array.isArray(uploaded) ? uploaded : []).map(mapOrganizationDocument),
        },
        optionData,
      ).documents;
      queryClient.setQueryData(selectedOrganizationQueryKey, (current = createInitialOrganization()) => ({
        ...current,
        status:
          current.status === ORGANIZATION_STATUSES.NOT_STARTED
            ? ORGANIZATION_STATUSES.DRAFT
            : current.status,
        currentStep: Math.max(Number(current.currentStep) || 1, 4),
        highestStepReached: Math.max(Number(current.highestStepReached) || 1, 4),
        documents: [
          ...current.documents.filter(
            (existing) =>
              !mappedDocuments.some(
                (document) => document.documentUid === existing.documentUid,
              ),
          ),
          ...mappedDocuments,
        ],
      }));
      return mappedDocuments;
    },
    [queryClient, selectedOrganizationQueryKey],
  );

  const deleteDocument = useCallback(
    async (documentUid) => {
      await organizationApi.deleteDocument(documentUid);
      queryClient.setQueryData(selectedOrganizationQueryKey, (current = createInitialOrganization()) => ({
        ...current,
        documents: current.documents.filter(
          (document) => (document.documentUid || document.id) !== documentUid,
        ),
      }));
    },
    [queryClient, selectedOrganizationQueryKey],
  );

  const refreshDocuments = useCallback(async () => {
    const serverDocuments = await organizationApi.listDocuments();
    const documents = enrichOrganizationLabels(
      {
        ...createInitialOrganization(),
        documents: (Array.isArray(serverDocuments) ? serverDocuments : []).map(
          mapOrganizationDocument,
        ),
      },
      queryClient.getQueryData(organizationOptionsQueryKey),
    ).documents;
    queryClient.setQueryData(selectedOrganizationQueryKey, (current = createInitialOrganization()) => ({
      ...current,
      documents,
    }));
    return documents;
  }, [queryClient, selectedOrganizationQueryKey]);

  const saveConfirmations = useCallback(
    (confirmations) => {
      organizationUiStateService.setConfirmations(
        organization.organizationUid,
        confirmations,
      );
      queryClient.setQueryData(selectedOrganizationQueryKey, (current = createInitialOrganization()) => ({
        ...current,
        confirmations,
      }));
      return confirmations;
    },
    [organization.organizationUid, queryClient, selectedOrganizationQueryKey],
  );

  const setCurrentStep = useCallback(
    (currentStep) => {
      const cachedOrganization =
        queryClient.getQueryData(selectedOrganizationQueryKey) || organization;
      const rememberedHighestStep = organizationUiStateService.setHighestStepReached(
        cachedOrganization.organizationUid,
        currentStep,
      );

      queryClient.setQueryData(selectedOrganizationQueryKey, (current = createInitialOrganization()) => ({
        ...current,
        currentStep,
        highestStepReached: Math.max(
          Number(current.highestStepReached) || 1,
          Number(currentStep) || 1,
          rememberedHighestStep,
        ),
      }));
    },
    [organization, queryClient, selectedOrganizationQueryKey],
  );

  const submit = useCallback(
    async ({ walletAddress, chainUid, walletChainId, walletNetwork }) => {
      const mapped = setOrganization(
        await organizationApi.submit({ walletAddress, chainUid }),
      );

      const organizationWithWallet = {
        ...mapped,
        walletAddress: mapped.walletAddress || walletAddress,
        chainUid: mapped.chainUid || chainUid || '',
        chainId: mapped.chainId || walletChainId || null,
        walletChainUid: mapped.walletChainUid || chainUid || '',
        walletChainId: mapped.walletChainId || mapped.chainId || walletChainId || null,
        walletNetwork: mapped.walletNetwork || walletNetwork || '',
      };

      queryClient.setQueryData(selectedOrganizationQueryKey, organizationWithWallet);
      return organizationWithWallet;
    },
    [queryClient, selectedOrganizationQueryKey, setOrganization],
  );

  const markUserNotified = useCallback(async () => {
    const response = await organizationApi.markUserNotified();

    queryClient.setQueryData(selectedOrganizationQueryKey, (current = createInitialOrganization()) => ({
      ...current,
      status: ORGANIZATION_STATUSES.VERIFIED,
      isNotified: true,
      verifiedScreenViewed: true,
    }));

    return response;
  }, [queryClient, selectedOrganizationQueryKey]);

  return {
    organization,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refresh,
    saveCompany,
    saveJurisdiction,
    saveBeneficialOwners,
    uploadDocuments,
    deleteDocument,
    refreshDocuments,
    saveConfirmations,
    setCurrentStep,
    submit,
    markUserNotified,
  };
}
