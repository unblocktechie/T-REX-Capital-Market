import { isTokenCreationLocked } from '@/utils/tokenCreationLock';
import { paymentContextOf } from '@/config/payment-tokens';
import { DEFAULT_CLAIM_TOPICS, TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { web3Config } from '@/config/web3';

const first = (...values) => values.find((value) => value !== undefined && value !== null);
const text = (...values) => String(first(...values, '') || '').trim();
const nonEmptyText = (...values) =>
  values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
const flag = (value) => value === true || value === 1 || value === '1' || value === 'true';

const normalize = (value) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const topicUid = (topic) =>
  text(
    topic?.claimTopicUid,
    topic?.claim_topic_uid,
    topic?.claimTopicUID,
    topic?.topicUid,
    topic?.topic_uid,
    topic?.claimTopicId,
    topic?.claim_topic_id,
    topic?.topicId,
    topic?.topic_id,
    topic?.uid,
    topic?.id,
  );

const topicSearchText = (topic) =>
  normalize(
    [
      topic?.value,
      topic?.claimTopicValue,
      topic?.claim_topic_value,
      topic?.claimTopicCode,
      topic?.claim_topic_code,
      topic?.topicCode,
      topic?.code,
      topic?.shortName,
      topic?.short_name,
      topic?.claimTopicName,
      topic?.claim_topic_name,
      topic?.topicName,
      topic?.topic_name,
      topic?.displayName,
      topic?.display_name,
      topic?.name,
      topic?.label,
      topic?.title,
      topic?.description,
    ]
      .filter(Boolean)
      .join(' '),
  );

const inferClaimId = (topic, index) => {
  const source = topicSearchText(topic);

  if (/\bkyc\b|know your customer|identity verification/.test(source)) return 'kyc';
  if (/accredited|qualified investor|professional investor/.test(source)) return 'accredited';
  if (/\baml\b|anti money laundering/.test(source)) return 'aml';

  const fallback = normalize(
    first(
      topic?.value,
      topic?.claimTopicCode,
      topic?.claim_topic_code,
      topic?.shortName,
      topic?.short_name,
      topic?.claimTopicName,
      topic?.claim_topic_name,
      topic?.topicName,
      topic?.topic_name,
      topic?.displayName,
      topic?.display_name,
      topic?.name,
      topic?.label,
      topicUid(topic),
      `claim-topic-${index}`,
    ),
  ).replace(/\s+/g, '-');

  return fallback || `claim-topic-${index}`;
};

const humanizeClaimLabel = (value) =>
  text(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const normalizedWord = word.toLowerCase();
      if (['kyc', 'aml', 'pep'].includes(normalizedWord)) return normalizedWord.toUpperCase();
      return normalizedWord.charAt(0).toUpperCase() + normalizedWord.slice(1);
    })
    .join(' ');

const claimLabel = (topic, fallback) =>
  humanizeClaimLabel(
    first(
      topic?.claimTopicName,
      topic?.claim_topic_name,
      topic?.topicName,
      topic?.topic_name,
      topic?.displayName,
      topic?.display_name,
      topic?.name,
      topic?.label,
      topic?.title,
      topic?.value,
      fallback,
    ),
  );

const claimRowsFromOptions = (data) => {
  if (Array.isArray(data)) return data;
  return (
    [
      data?.claimTopics,
      data?.claim_topics,
      data?.topics,
      data?.claims,
      data?.options?.claimTopics,
      data?.data?.claimTopics,
    ].find(Array.isArray) || []
  );
};

export const mapTokenOptions = (data) => {
  const rows = claimRowsFromOptions(data);
  const usedIds = new Set();

  const claimTopics = rows
    .map((topic, index) => {
      const uid = topicUid(topic);
      const inferredId = inferClaimId(topic, index);
      let id = inferredId;
      let duplicateIndex = 2;
      while (usedIds.has(id)) {
        id = `${inferredId}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedIds.add(id);

      const defaultTopic = DEFAULT_CLAIM_TOPICS.find((item) => item.id === inferredId);
      const name = claimLabel(topic, defaultTopic?.name || `Verification requirement ${index + 1}`);
      const mandatory = flag(
        first(
          topic?.isRequired,
          topic?.is_required,
          topic?.mandatory,
          topic?.isMandatory,
          false,
        ),
      );

      return {
        ...(defaultTopic || {}),
        id,
        claimTopicUid: uid,
        value: text(
          topic?.value,
          topic?.claimTopicValue,
          topic?.claim_topic_value,
          topic?.claimTopicCode,
          topic?.claim_topic_code,
          topic?.code,
        ),
        name,
        shortName: text(
          topic?.shortName,
          topic?.short_name,
          topic?.value,
          defaultTopic?.shortName,
          name,
        ),
        description: text(
          topic?.description,
          topic?.helpText,
          topic?.help_text,
          defaultTopic?.description,
          'This investor claim must be verified before an eligible token transfer.',
        ),
        enabled: mandatory,
        required: mandatory,
        mandatory,
        available: Boolean(uid),
      };
    })
    .filter((topic) => topic.claimTopicUid);

  return {
    claimTopics,
    rawClaimTopics: claimTopics,
  };
};

export const mapTokenCountries = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((country) => ({
      countryUid: text(country?.countryUid, country?.uid, country?.id),
      countryName: text(country?.countryName, country?.name),
      countryCode: text(country?.countryCode, country?.iso2, country?.code),
      iso3166NumericCode: text(
        country?.iso3166NumericCode,
        country?.numericCode,
        country?.isoNumeric,
      ),
    }))
    .filter((country) => country.countryUid && country.countryName)
    .sort((a, b) => a.countryName.localeCompare(b.countryName));

const findCountry = (restriction, countries) => {
  const uid = text(restriction?.countryUid, restriction?.uid, restriction);
  const name = text(restriction?.countryName, restriction?.name);
  const code = text(restriction?.countryCode, restriction?.iso2);
  const matched = countries.find(
    (country) =>
      (uid && country.countryUid === uid) ||
      (name && country.countryName.toLowerCase() === name.toLowerCase()) ||
      (code && country.countryCode.toLowerCase() === code.toLowerCase()),
  );

  return (
    matched || {
      countryUid: uid,
      countryName: name || uid,
      countryCode: code,
      iso3166NumericCode: text(restriction?.iso3166NumericCode),
    }
  );
};

const selectedClaimUids = (data) => {
  const claimRows = first(
    data?.claimTopics,
    data?.claimTopicUids,
    data?.claims?.claimTopics,
    data?.claims?.claimTopicUids,
    data?.identityClaims?.claimTopics,
    data?.identityClaims?.claimTopicUids,
    [],
  );
  if (!Array.isArray(claimRows)) return new Set();
  return new Set(
    claimRows
      .map((topic) => (typeof topic === 'string' ? topic : topicUid(topic)))
      .filter(Boolean),
  );
};

const selectedClaimValues = (data) => {
  const claimRows = first(
    data?.claimTopics,
    data?.claimTopicUids,
    data?.claims?.claimTopics,
    data?.claims?.claimTopicUids,
    data?.identityClaims?.claimTopics,
    data?.identityClaims?.claimTopicUids,
    [],
  );
  if (!Array.isArray(claimRows)) return new Set();
  return new Set(claimRows.map((topic, index) => inferClaimId(topic, index)).filter(Boolean));
};

const normalizeCurrentStep = (value) => normalize(value).replace(/\s+/g, '-');

const completedFromStep = (currentStep, status) => {
  const normalizedStatus = normalize(status).replace(/\s+/g, '');
  if (
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
    ].includes(normalizedStatus)
  ) {
    return TOKEN_ISSUANCE_STEPS.map((step) => step.key);
  }

  const stepOrder = {
    information: 0,
    'token-information': 0,
    claims: 1,
    'identity-claims': 1,
    compliance: 2,
    governance: 3,
    agents: 3,
    review: 4,
  };
  const index = stepOrder[currentStep] ?? 0;
  return TOKEN_ISSUANCE_STEPS.slice(0, index).map((step) => step.key);
};

export const mapTokenForm = ({ data, options, countries, logo }) => {
  if (!data) {
    return {
      exists: false,
      options,
      countries,
      logo: logo || null,
      completedSteps: [],
      server: {
        tokenUid: '',
        currentStep: 'information',
        status: 'draft',
        isDraft: true,
        imageAvailable: false,
        updatedAt: null,
      },
    };
  }

  const information = first(data?.tokenInformation, data?.information, data) || {};
  const claims = first(data?.claims, data?.identityClaims, data) || {};
  const compliance = first(data?.compliance, data?.complianceRules, data) || {};
  const governance = first(data?.governance, data?.agents, data) || {};
  const selectedUids = selectedClaimUids(data);
  const selectedValues = selectedClaimValues(data);
  const optionTopics = options?.claimTopics || [];
  const mappedClaims = optionTopics.map((topic) => {
    const selected =
      (topic.claimTopicUid && selectedUids.has(topic.claimTopicUid)) || selectedValues.has(topic.id);
    return {
      ...topic,
      enabled: selected,
      required: selected,
    };
  });

  const restrictionRows = first(
    compliance?.countryRestrictions,
    compliance?.countries,
    compliance?.countryUids,
    data?.countryRestrictions,
    [],
  );
  const mappedCountries = (Array.isArray(restrictionRows) ? restrictionRows : [])
    .map((restriction) => findCountry(restriction, countries))
    .filter((country) => country.countryUid || country.countryName);

  const currentStep = normalizeCurrentStep(data?.currentStep || 'information');
  const status = text(data?.status, 'draft');
  const completedSteps = completedFromStep(currentStep, status);
  const approvedOrganizationWallet = nonEmptyText(
    information?.treasuryWalletAddress,
    information?.treasuryWallet,
    data?.tokenInformation?.treasuryWalletAddress,
    data?.tokenInformation?.treasuryWallet,
    data?.information?.treasuryWalletAddress,
    data?.information?.treasuryWallet,
    data?.treasuryWalletAddress,
    data?.treasuryWallet,
    data?.organizationWalletAddress,
    data?.organization?.walletAddress,
    data?.approvedOrganizationWalletAddress,
  );
  const persistedTokenAgentWallet = nonEmptyText(
    governance?.tokenAgentWalletAddress,
    governance?.tokenAgent?.address,
    typeof governance?.tokenAgent === 'string' ? governance.tokenAgent : '',
    data?.agents?.tokenAgentWalletAddress,
    data?.agents?.tokenAgent?.address,
    typeof data?.agents?.tokenAgent === 'string' ? data.agents.tokenAgent : '',
    data?.tokenAgentWalletAddress,
    data?.tokenAgent?.address,
    typeof data?.tokenAgent === 'string' ? data.tokenAgent : '',
  );
  const persistedIdentityManagerWallet = nonEmptyText(
    governance?.identityManagerWalletAddress,
    governance?.identityRegistryAgent?.address,
    governance?.identityManager?.address,
    typeof governance?.identityManager === 'string' ? governance.identityManager : '',
    data?.agents?.identityManagerWalletAddress,
    data?.agents?.identityRegistryAgent?.address,
    data?.agents?.identityManager?.address,
    typeof data?.agents?.identityManager === 'string' ? data.agents.identityManager : '',
    data?.identityManagerWalletAddress,
    data?.identityRegistryAgent?.address,
    data?.identityManager?.address,
    typeof data?.identityManager === 'string' ? data.identityManager : '',
  );
  const savedGovernanceWallet = completedSteps.includes('agents')
    ? approvedOrganizationWallet
    : '';

  // chainUid is the backend-stable network identifier. Older/sparse token
  // responses can omit chainId even though chainUid is present. Recover the
  // numeric id from the bootstrapped chain catalogue so refreshed deployment
  // routes do not fall back to an unrelated wallet/application network.
  const persistedChainUid = text(
    information?.chainUid,
    data?.chainUid,
    information?.chain?.chainUid,
    data?.chain?.chainUid,
  );
  const persistedChainId =
    Number(
      first(
        information?.chainId,
        data?.chainId,
        information?.chain?.chainId,
        data?.chain?.chainId,
      ),
    ) || null;
  const chainFromUid = persistedChainUid
    ? web3Config.getChainRecordByUid(persistedChainUid)
    : null;
  const chainFromId = persistedChainId
    ? web3Config.getChainRecordById(persistedChainId)
    : null;
  const resolvedChain = chainFromUid || chainFromId;
  const resolvedChainUid = persistedChainUid || resolvedChain?.chainUid || '';
  // When chainUid exists it is authoritative. This also repairs a stale numeric
  // chainId from an older draft while never guessing from the platform default.
  const resolvedChainId = chainFromUid?.chainId || persistedChainId || null;
  const resolvedNetworkName =
    text(
      information?.chainName,
      data?.chainName,
      information?.network,
      information?.networkName,
      data?.networkName,
    ) || resolvedChain?.chainName || '';

  return {
    exists: true,
    tokenInformation: {
      logo: logo || null,
      chainUid: resolvedChainUid,
      chainId: resolvedChainId,
      name: text(information?.tokenName, information?.name),
      symbol: text(information?.tokenSymbol, information?.symbol).toUpperCase(),
      decimals: text(information?.decimals, '18'),
      description: text(information?.tokenDescription, information?.description),
      treasuryWallet: nonEmptyText(
        information?.treasuryWalletAddress,
        information?.treasuryWallet,
        data?.treasuryWalletAddress,
        data?.treasuryWallet,
        data?.organizationWalletAddress,
        data?.organization?.walletAddress,
        data?.approvedOrganizationWalletAddress,
      ),
      network: resolvedNetworkName,
    },
    supplyPricing: {
      initialPrice: text(
        information?.initialTokenPrice,
        information?.initialPrice,
        data?.initialTokenPrice,
        data?.initialPrice,
      ),
      currentPrice: text(
        information?.currentTokenPrice,
        information?.currentPrice,
        data?.currentTokenPrice,
        data?.currentPrice,
        information?.initialTokenPrice,
        information?.initialPrice,
        data?.initialTokenPrice,
        data?.initialPrice,
      ),
      currency: paymentContextOf(information, data).paymentTokenSymbol,
      paymentTokenAddress: paymentContextOf(information, data).paymentTokenAddress,
      paymentTokenDecimals: paymentContextOf(information, data).paymentTokenDecimals,
      paymentTokenLocked: isTokenCreationLocked(data, information),
      controllerAddress: paymentContextOf(information, data).controllerAddress,
    },
    identityClaims: {
      claimTopics: mappedClaims,
      trustedIssuer: {
        address: nonEmptyText(
          claims?.trustedClaimIssuerWalletAddress,
          claims?.trustedIssuerWalletAddress,
          information?.treasuryWalletAddress,
          information?.treasuryWallet,
          data?.organizationWalletAddress,
          data?.organization?.walletAddress,
          data?.approvedOrganizationWalletAddress,
        ),
        mode: flag(
          first(
            claims?.organizationActsAsTrustedClaimIssuer,
            claims?.organizationActsAsClaimIssuer,
            selectedUids.size > 0,
          ),
        )
          ? 'organization'
          : '',
        claimTopics: mappedClaims.filter((topic) => topic.enabled).map((topic) => topic.id),
      },
    },
    compliance: {
      maximumInvestors: text(compliance?.maxInvestors, compliance?.maximumInvestors),
      maximumBalance: text(
        compliance?.maxBalancePerInvestor,
        compliance?.maximumBalance,
      ),
      geographyMode: text(compliance?.countryRestrictionMode, 'blocklist'),
      countries: mappedCountries,
    },
    agents: {
      tokenAgent: {
        address: nonEmptyText(persistedTokenAgentWallet, savedGovernanceWallet),
      },
      identityRegistryAgent: {
        address: nonEmptyText(persistedIdentityManagerWallet, savedGovernanceWallet),
      },
    },
    options,
    countries,
    completedSteps,
    server: {
      tokenUid: text(data?.tokenUid, data?.uid, data?.id),
      currentStep,
      status,
      isDraft: flag(first(data?.isDraft, status.toLowerCase() === 'draft')),
      imageAvailable: Boolean(
        logo ||
          data?.imageMimeType ||
          data?.tokenImage ||
          information?.imageMimeType ||
          information?.tokenImage ||
          completedSteps.includes('token-information'),
      ),
      governanceNeedsSync: Boolean(
        normalize(status).replace(/\s+/g, '') === 'draft' &&
          completedSteps.includes('agents') &&
          approvedOrganizationWallet &&
          (!persistedTokenAgentWallet || !persistedIdentityManagerWallet),
      ),
      updatedAt: first(data?.updatedAt, data?.modifiedAt, null),
    },
  };
};

export const tokenStepFromCurrentStep = (currentStep) => {
  const normalized = normalizeCurrentStep(currentStep);
  const map = {
    information: 'token-information',
    'token-information': 'token-information',
    claims: 'identity-claims',
    'identity-claims': 'identity-claims',
    compliance: 'compliance',
    governance: 'agents',
    agents: 'agents',
    review: 'review',
  };
  return map[normalized] || 'token-information';
};

export const normalizeCountrySelection = (selection, countries) => {
  const rows = Array.isArray(selection) ? selection : [];
  return rows
    .map((item) => {
      if (item && typeof item === 'object') {
        return findCountry(item, countries);
      }
      return findCountry({ countryName: String(item || '') }, countries);
    })
    .filter((country) => country.countryUid || country.countryName)
    .filter(
      (country, index, all) =>
        index ===
        all.findIndex(
          (candidate) =>
            (country.countryUid && candidate.countryUid === country.countryUid) ||
            (!country.countryUid && candidate.countryName === country.countryName),
        ),
    );
};

export const toClaimsPayload = (identityClaims, isDraft = false) => ({
  claimTopicUids: (identityClaims?.claimTopics || [])
    .filter((topic) => topic.enabled)
    .map((topic) => topic.claimTopicUid)
    .filter(Boolean),
  organizationActsAsTrustedClaimIssuer:
    identityClaims?.trustedIssuer?.mode === 'organization',
  isDraft: Boolean(isDraft),
});

export const toCompliancePayload = (compliance, isDraft = false) => ({
  maxInvestors:
    compliance?.maximumInvestors === '' || compliance?.maximumInvestors == null
      ? null
      : Number(compliance.maximumInvestors),
  maxBalancePerInvestor:
    compliance?.maximumBalance === '' || compliance?.maximumBalance == null
      ? null
      : Number(compliance.maximumBalance),
  countryRestrictionMode: 'blocklist',
  countryUids: (compliance?.countries || [])
    .map((country) =>
      typeof country === 'string' ? '' : text(country?.countryUid, country?.value),
    )
    .filter(Boolean),
  isDraft: Boolean(isDraft),
});

export const toGovernancePayload = (agents, isDraft = false) => ({
  tokenAgentWalletAddress: text(agents?.tokenAgent?.address),
  identityManagerWalletAddress: text(agents?.identityRegistryAgent?.address),
  isDraft: Boolean(isDraft),
});
