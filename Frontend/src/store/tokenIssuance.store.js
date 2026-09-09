import { create } from 'zustand';
import { AGENT_ROLES, TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { web3Config } from '@/config/web3';
import { useAuthStore } from '@/store/auth.store';

const LEGACY_TOKEN_DRAFT_STORAGE_KEY = 'trex-token-issuance-draft';

// Token issuance is backend-authoritative. Remove drafts created by older frontend builds so
// values from another browser session or user are never restored into a new token form.
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_DRAFT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

const createInitialAgents = () =>
  AGENT_ROLES.reduce((result, role) => {
    result[role.key] = {
      address: '',
      autoAssigned: role.required,
      required: role.required,
    };
    return result;
  }, {});

const createBackendState = () => ({
  hydrated: false,
  loading: false,
  error: '',
  tokenUid: '',
  currentStep: 'information',
  status: 'draft',
  isDraft: true,
  isLocked: false,
  imageAvailable: false,
  lastSavedStep: '',
  lastSavedAt: null,
  claimTopicOptions: [],
  countryOptions: [],
});

export const createInitialTokenIssuanceState = () => ({
  tokenInformation: {
    logo: null,
    name: '',
    symbol: '',
    decimals: '',
    assetClass: '',
    description: '',
    treasuryWallet: '',
    network: web3Config.requiredChain.name,
    externalReference: '',
    legalIdentifier: '',
  },
  supplyPricing: {
    totalSupply: '',
    initialPrice: '',
    currency: 'USDT',
    minimumInvestment: '',
    maximumInvestment: '',
    minimumTokenPurchase: '',
    maximumTokenPurchase: '',
    treasuryWallet: '',
    allocation: '',
    lockupDays: '',
    mintingModel: 'fixed',
  },
  identityClaims: {
    claimTopics: [],
    customClaimTopics: [],
    trustedIssuer: {
      mode: '',
      name: '',
      address: '',
      claimTopics: [],
      verificationStatus: 'Organization verified',
      network: web3Config.requiredChain.name,
      role: 'Trusted claim issuer',
    },
  },
  compliance: {
    maximumInvestors: '',
    maximumBalance: '',
    minimumBalance: '',
    maximumTransaction: '',
    geographyMode: 'blocklist',
    countries: [],
    transfersPaused: false,
    investorTransfers: true,
    lockupDays: '',
    dailyTransactionLimit: '',
    maximumOwnershipPercentage: '',
    forcedTransfer: true,
    tokenRecovery: true,
  },
  agents: createInitialAgents(),
  completedSteps: [],
  touchedSteps: [],
  deployment: {
    status: 'idle',
    activeStage: 0,
    deploymentAttemptUid: '',
    attemptStatus: '',
    idempotencyKey: '',
    transactionHash: '',
    error: '',
    result: null,
    requestStartedAt: null,
    canRetry: false,
    retryMode: '',
    pendingSync: null,
    walletAction: null,
  },
  backend: createBackendState(),
  updatedAt: null,
});

const stepIndex = (stepKey) => TOKEN_ISSUANCE_STEPS.findIndex((step) => step.key === stepKey);

const invalidateFromStep = (completedSteps, stepKey) => {
  const changedIndex = stepIndex(stepKey);
  if (changedIndex < 0) return completedSteps;
  return completedSteps.filter((completedKey) => stepIndex(completedKey) < changedIndex);
};

const sectionStep = {
  tokenInformation: 'token-information',
  supplyPricing: 'token-information',
  identityClaims: 'identity-claims',
  compliance: 'compliance',
  agents: 'agents',
};

const valuesChanged = (current, values) =>
  Object.entries(values || {}).some(([key, value]) => current?.[key] !== value);

const countryKey = (country) =>
  typeof country === 'string'
    ? country
    : country?.countryUid || country?.value || country?.countryName || country?.label || '';

const normalizePersistedCountry = (country) => {
  if (country && typeof country === 'object') {
    return {
      countryUid: country.countryUid || country.value || '',
      countryName: country.countryName || country.label || country.name || '',
      countryCode: country.countryCode || country.code || '',
      iso3166NumericCode: country.iso3166NumericCode || '',
    };
  }
  return {
    countryUid: '',
    countryName: String(country || ''),
    countryCode: '',
    iso3166NumericCode: '',
  };
};

export const useTokenIssuanceStore = create((set, get) => ({
  ...createInitialTokenIssuanceState(),

  updateSection: (section, values) =>
    set((state) => {
      if (!valuesChanged(state[section], values)) return state;
      const changedStep = sectionStep[section];
      return {
        [section]: { ...state[section], ...values },
        completedSteps: changedStep
          ? invalidateFromStep(state.completedSteps, changedStep)
          : state.completedSteps,
        backend: {
          ...state.backend,
          lastSavedStep:
            state.backend.lastSavedStep === changedStep ? '' : state.backend.lastSavedStep,
        },
        updatedAt: new Date().toISOString(),
      };
    }),

  updateNestedSection: (section, nestedKey, values) =>
    set((state) => {
      if (!valuesChanged(state[section]?.[nestedKey], values)) return state;
      const changedStep = sectionStep[section];
      return {
        [section]: {
          ...state[section],
          [nestedKey]: { ...state[section][nestedKey], ...values },
        },
        completedSteps: changedStep
          ? invalidateFromStep(state.completedSteps, changedStep)
          : state.completedSteps,
        updatedAt: new Date().toISOString(),
      };
    }),

  updateClaimTopic: (topicId, values) =>
    set((state) => ({
      identityClaims: {
        ...state.identityClaims,
        claimTopics: state.identityClaims.claimTopics.map((topic) =>
          topic.id === topicId ? { ...topic, ...values } : topic,
        ),
      },
      completedSteps: invalidateFromStep(state.completedSteps, 'identity-claims'),
      updatedAt: new Date().toISOString(),
    })),

  addCustomClaimTopic: (topic) =>
    set((state) => ({
      identityClaims: {
        ...state.identityClaims,
        customClaimTopics: [...state.identityClaims.customClaimTopics, topic],
      },
      completedSteps: invalidateFromStep(state.completedSteps, 'identity-claims'),
      updatedAt: new Date().toISOString(),
    })),

  removeCustomClaimTopic: (topicId) =>
    set((state) => ({
      identityClaims: {
        ...state.identityClaims,
        customClaimTopics: state.identityClaims.customClaimTopics.filter(
          (topic) => topic.id !== topicId,
        ),
      },
      completedSteps: invalidateFromStep(state.completedSteps, 'identity-claims'),
      updatedAt: new Date().toISOString(),
    })),

  updateAgent: (agentKey, values) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [agentKey]: { ...state.agents[agentKey], ...values },
      },
      completedSteps: invalidateFromStep(state.completedSteps, 'agents'),
      updatedAt: new Date().toISOString(),
    })),

  toggleCountry: (country) =>
    set((state) => {
      const key = countryKey(country);
      const selected = state.compliance.countries.some((item) => countryKey(item) === key);
      return {
        compliance: {
          ...state.compliance,
          countries: selected
            ? state.compliance.countries.filter((item) => countryKey(item) !== key)
            : [...state.compliance.countries, normalizePersistedCountry(country)],
        },
        completedSteps: invalidateFromStep(state.completedSteps, 'compliance'),
        updatedAt: new Date().toISOString(),
      };
    }),

  markStepCompleted: (stepKey) =>
    set((state) => ({
      completedSteps: state.completedSteps.includes(stepKey)
        ? state.completedSteps
        : [...state.completedSteps, stepKey],
      touchedSteps: state.touchedSteps.includes(stepKey)
        ? state.touchedSteps
        : [...state.touchedSteps, stepKey],
    })),

  markStepTouched: (stepKey) =>
    set((state) => ({
      touchedSteps: state.touchedSteps.includes(stepKey)
        ? state.touchedSteps
        : [...state.touchedSteps, stepKey],
    })),

  setDeployment: (values) =>
    set((state) => ({ deployment: { ...state.deployment, ...values } })),

  hydrateTrustedIssuer: (values) =>
    set((state) => ({
      identityClaims: {
        ...state.identityClaims,
        trustedIssuer: {
          ...state.identityClaims.trustedIssuer,
          ...values,
        },
      },
    })),

  setBackendState: (values) =>
    set((state) => ({ backend: { ...state.backend, ...values } })),

  hydrateFromBackend: (mapped) =>
    set(() => {
      const optionTopics = mapped?.options?.claimTopics || [];
      const countryOptions = mapped?.countries || [];
      const initial = createInitialTokenIssuanceState();
      const lockedStatus = String(mapped?.server?.status || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
      const isLocked = [
        'readytodeploy',
        'deploymentpending',
        'deploymentfailed',
        'deployed',
      ].includes(lockedStatus);

      if (!mapped?.exists) {
        return {
          tokenInformation: initial.tokenInformation,
          supplyPricing: initial.supplyPricing,
          identityClaims: {
            ...initial.identityClaims,
            claimTopics: optionTopics.map((topic) => ({
              ...topic,
              enabled: false,
              required: false,
            })),
          },
          compliance: initial.compliance,
          agents: initial.agents,
          completedSteps: [],
          touchedSteps: [],
          deployment: initial.deployment,
          backend: {
            ...createBackendState(),
            hydrated: true,
            claimTopicOptions: optionTopics,
            countryOptions,
          },
          updatedAt: null,
        };
      }

      const nextClaims = (mapped.identityClaims?.claimTopics || optionTopics).map((topic) => ({
        ...topic,
      }));

      return {
        tokenInformation: {
          ...initial.tokenInformation,
          ...(mapped.tokenInformation || {}),
          logo: mapped.tokenInformation?.logo || mapped.logo || null,
          network:
            mapped.tokenInformation?.network || web3Config.requiredChain.name,
        },
        supplyPricing: {
          ...initial.supplyPricing,
          ...(mapped.supplyPricing || {}),
          currency: 'USDT',
        },
        identityClaims: {
          ...initial.identityClaims,
          ...(mapped.identityClaims || {}),
          claimTopics: nextClaims,
          trustedIssuer: {
            ...initial.identityClaims.trustedIssuer,
            ...(mapped.identityClaims?.trustedIssuer || {}),
          },
        },
        compliance: {
          ...initial.compliance,
          ...(mapped.compliance || {}),
          geographyMode: 'blocklist',
          countries: mapped.compliance?.countries || [],
        },
        agents: Object.entries(initial.agents).reduce((result, [key, defaultAgent]) => {
          result[key] = {
            ...defaultAgent,
            ...(mapped.agents?.[key] || {}),
          };
          return result;
        }, {}),
        completedSteps: mapped.completedSteps || [],
        touchedSteps: mapped.completedSteps || [],
        deployment: initial.deployment,
        backend: {
          ...createBackendState(),
          ...mapped.server,
          hydrated: true,
          isLocked,
          claimTopicOptions: optionTopics,
          countryOptions,
        },
        updatedAt: mapped.server?.updatedAt || null,
      };
    }),

  recordBackendSave: (stepKey, response = {}) =>
    set((state) => ({
      backend: {
        ...state.backend,
        tokenUid: response?.tokenUid || response?.uid || state.backend.tokenUid,
        currentStep: response?.currentStep || state.backend.currentStep,
        status: response?.status || state.backend.status,
        isDraft:
          response?.isDraft === undefined ? state.backend.isDraft : Boolean(response.isDraft),
        imageAvailable:
          stepKey === 'token-information' || state.backend.imageAvailable,
        lastSavedStep: stepKey,
        lastSavedAt: new Date().toISOString(),
        error: '',
      },
    })),

  hydrateWalletDefaults: (address) => {
    if (!address) return;
    const state = get();
    const agentUpdates = Object.entries(state.agents).reduce((result, [key, value]) => {
      result[key] = value.autoAssigned && !value.address ? { ...value, address } : value;
      return result;
    }, {});
    set({
      tokenInformation: {
        ...state.tokenInformation,
        treasuryWallet: state.tokenInformation.treasuryWallet || address,
        network: state.tokenInformation.network || web3Config.requiredChain.name,
      },
      supplyPricing: {
        ...state.supplyPricing,
        treasuryWallet: state.supplyPricing.treasuryWallet || address,
        currency: 'USDT',
      },
      identityClaims: {
        ...state.identityClaims,
        trustedIssuer: {
          ...state.identityClaims.trustedIssuer,
          address: state.identityClaims.trustedIssuer.address || address,
          network:
            state.identityClaims.trustedIssuer.network || web3Config.requiredChain.name,
        },
      },
      agents: agentUpdates,
    });
  },

  resetIssuance: () => set(createInitialTokenIssuanceState()),
}));

const tokenUserKey = (user) => user?.userUid || user?.uid || user?.email || '';

// Clear in-memory wizard values whenever the authenticated account changes. This prevents one
// issuer's unsaved values from appearing for another issuer during a logout/login cycle.
useAuthStore.subscribe((state, previousState) => {
  if (tokenUserKey(state.user) !== tokenUserKey(previousState.user)) {
    useTokenIssuanceStore.getState().resetIssuance();
  }
});
