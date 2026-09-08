import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENT_ROLES, DEFAULT_CLAIM_TOPICS, TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { web3Config } from '@/config/web3';

const createInitialAgents = () =>
  AGENT_ROLES.reduce((result, role) => {
    result[role.key] = {
      address: '',
      autoAssigned: role.required,
      required: role.required,
    };
    return result;
  }, {});

export const createInitialTokenIssuanceState = () => ({
  tokenInformation: {
    name: '',
    symbol: '',
    decimals: '18',
    assetClass: '',
    description: '',
    treasuryWallet: '',
    network: web3Config.requiredChain.name,
    externalReference: '',
    legalIdentifier: '',
  },
  // Keep the existing payload section and property names. Only initialPrice is exposed by the
  // simplified wizard; the remaining values stay available for current backend compatibility.
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
    claimTopics: DEFAULT_CLAIM_TOPICS.map((topic) => ({ ...topic })),
    customClaimTopics: [],
    trustedIssuer: {
      mode: 'organization',
      name: '',
      address: '',
      claimTopics: ['kyc'],
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
    geographyMode: 'allowlist',
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
    transactionHash: '',
    error: '',
    result: null,
    requestStartedAt: null,
    canRetry: false,
  },
  updatedAt: null,
});

const migrateDraft = (persistedState) => {
  const initial = createInitialTokenIssuanceState();
  const saved = persistedState && typeof persistedState === 'object' ? persistedState : {};
  const savedTopics = Array.isArray(saved.identityClaims?.claimTopics)
    ? saved.identityClaims.claimTopics
    : [];

  const claimTopics = DEFAULT_CLAIM_TOPICS.map((defaultTopic) => {
    const savedTopic = savedTopics.find((topic) => topic?.id === defaultTopic.id);
    return {
      ...defaultTopic,
      ...(savedTopic || {}),
      id: defaultTopic.id,
      name: defaultTopic.name,
      shortName: defaultTopic.shortName,
      description: defaultTopic.description,
    };
  });

  const enabledClaimTopicIds = claimTopics.filter((topic) => topic.enabled).map((topic) => topic.id);
  const knownStepKeys = new Set(TOKEN_ISSUANCE_STEPS.map((step) => step.key));

  return {
    ...initial,
    ...saved,
    tokenInformation: {
      ...initial.tokenInformation,
      ...(saved.tokenInformation || {}),
      network: saved.tokenInformation?.network || web3Config.requiredChain.name,
    },
    supplyPricing: {
      ...initial.supplyPricing,
      ...(saved.supplyPricing || {}),
      currency: 'USDT',
    },
    identityClaims: {
      ...initial.identityClaims,
      ...(saved.identityClaims || {}),
      claimTopics,
      customClaimTopics: [],
      trustedIssuer: {
        ...initial.identityClaims.trustedIssuer,
        ...(saved.identityClaims?.trustedIssuer || {}),
        network:
          saved.identityClaims?.trustedIssuer?.network || web3Config.requiredChain.name,
        claimTopics: enabledClaimTopicIds,
      },
    },
    compliance: {
      ...initial.compliance,
      ...(saved.compliance || {}),
      geographyMode: 'allowlist',
      countries: Array.isArray(saved.compliance?.countries) ? saved.compliance.countries : [],
    },
    agents: Object.entries(initial.agents).reduce((result, [key, defaultAgent]) => {
      result[key] = { ...defaultAgent, ...(saved.agents?.[key] || {}) };
      return result;
    }, {}),
    completedSteps: Array.isArray(saved.completedSteps)
      ? saved.completedSteps.filter((stepKey) => knownStepKeys.has(stepKey))
      : [],
    touchedSteps: Array.isArray(saved.touchedSteps)
      ? saved.touchedSteps.filter((stepKey) => knownStepKeys.has(stepKey))
      : [],
    deployment: {
      ...initial.deployment,
      ...(saved.deployment || {}),
    },
  };
};

export const useTokenIssuanceStore = create(
  persist(
    (set, get) => ({
      ...createInitialTokenIssuanceState(),
      updateSection: (section, values) =>
        set((state) => ({
          [section]: { ...state[section], ...values },
          updatedAt: new Date().toISOString(),
        })),
      updateNestedSection: (section, nestedKey, values) =>
        set((state) => ({
          [section]: {
            ...state[section],
            [nestedKey]: { ...state[section][nestedKey], ...values },
          },
          updatedAt: new Date().toISOString(),
        })),
      updateClaimTopic: (topicId, values) =>
        set((state) => ({
          identityClaims: {
            ...state.identityClaims,
            claimTopics: state.identityClaims.claimTopics.map((topic) =>
              topic.id === topicId ? { ...topic, ...values } : topic,
            ),
          },
          updatedAt: new Date().toISOString(),
        })),
      // Retained for API/state compatibility. The simplified UI does not expose custom topics.
      addCustomClaimTopic: (topic) =>
        set((state) => ({
          identityClaims: {
            ...state.identityClaims,
            customClaimTopics: [...state.identityClaims.customClaimTopics, topic],
          },
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
          updatedAt: new Date().toISOString(),
        })),
      updateAgent: (agentKey, values) =>
        set((state) => ({
          agents: {
            ...state.agents,
            [agentKey]: { ...state.agents[agentKey], ...values },
          },
          updatedAt: new Date().toISOString(),
        })),
      toggleCountry: (country) =>
        set((state) => {
          const selected = state.compliance.countries.includes(country);
          return {
            compliance: {
              ...state.compliance,
              countries: selected
                ? state.compliance.countries.filter((item) => item !== country)
                : [...state.compliance.countries, country],
            },
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
    }),
    {
      name: 'trex-token-issuance-draft',
      version: 2,
      migrate: migrateDraft,
      partialize: (state) => ({
        tokenInformation: state.tokenInformation,
        supplyPricing: state.supplyPricing,
        identityClaims: state.identityClaims,
        compliance: state.compliance,
        agents: state.agents,
        completedSteps: state.completedSteps,
        touchedSteps: state.touchedSteps,
        deployment: state.deployment,
        updatedAt: state.updatedAt,
      }),
    },
  ),
);
