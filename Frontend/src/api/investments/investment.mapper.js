const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const text = (...values) => String(first(...values, '') || '').trim();
const numberOrNull = (...values) => {
  const value = first(...values);
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const claimTopicNumber = (...values) => {
  for (const value of values) {
    if (value === '' || value === undefined || value === null || typeof value === 'object') continue;
    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) continue;
    const number = Number(normalized);
    if (Number.isSafeInteger(number) && number >= 0) return number;
  }
  return null;
};
const array = (...values) => values.find(Array.isArray) || [];
const flag = (value) => value === true || value === 1 || value === '1' || value === 'true';
const stringList = (value) => {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(',').map((item) => item.trim()).filter(Boolean);
};

const humanize = (value) =>
  text(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (['kyc', 'aml', 'ctf', 'erc', 'id'].includes(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');

const splitDescription = (value) => {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const normalized = text(value);
  if (!normalized) return [];
  return normalized.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
};

export const mapClaimTopic = (topic, index = 0) => {
  const topicObject = topic && typeof topic === 'object' ? topic : {};
  const primitiveTopic = ['number', 'bigint', 'string'].includes(typeof topic) ? topic : undefined;
  const claimTopicValue = claimTopicNumber(
    primitiveTopic,
    topicObject?.claimTopicValue,
    topicObject?.claim_topic_value,
    topicObject?.claimTopic,
    topicObject?.topicValue,
    topicObject?.topic_value,
    topicObject?.topic,
    topicObject?.numericValue,
    topicObject?.numeric_value,
    topicObject?.claimTopic?.claimTopicValue,
    topicObject?.claimTopic?.claim_topic_value,
    topicObject?.claimTopic?.topicValue,
    topicObject?.claimTopic?.value,
    topicObject?.value,
  );
  const primitiveCode = typeof primitiveTopic === 'string' && !/^\d+$/.test(primitiveTopic.trim())
    ? primitiveTopic
    : undefined;
  const claimTopicCode = text(
    topicObject?.claimTopicCode,
    topicObject?.code,
    topicObject?.claimTopic?.claimTopicCode,
    topicObject?.claimTopic?.code,
    primitiveCode,
  ).toUpperCase();
  const claimTopicUid = text(
    topicObject?.claimTopicUid,
    topicObject?.topicUid,
    topicObject?.uid,
    topicObject?.id,
    topicObject?.claimTopic?.claimTopicUid,
  );
  const label = text(
    topicObject?.claimTopicName,
    topicObject?.name,
    topicObject?.label,
    topicObject?.claimTopic?.claimTopicName,
    humanize(claimTopicCode || (claimTopicValue !== null ? `Claim Topic ${claimTopicValue}` : `Claim Topic ${index + 1}`)),
  );

  return {
    id: claimTopicUid || claimTopicCode || (claimTopicValue !== null ? `claim-topic-${claimTopicValue}` : `claim-topic-${index + 1}`),
    claimTopicUid,
    claimTopicCode,
    claimTopic: claimTopicValue,
    claimTopicValue,
    label,
    description: text(topicObject?.description, topicObject?.claimTopic?.description),
  };
};

export const mapEligibility = (data) => {
  const rawTopics = array(
    data?.requiredClaimTopics,
    data?.requiredDocuments,
    data?.claimTopics,
    data?.topics,
  );
  const rejectedCodes = stringList(
    data?.rejection?.rejectedClaim ?? data?.rejectedClaim ?? data?.rejection?.rejectedClaims,
  ).map((item) => item.toUpperCase());

  const topics = rawTopics.map((topic, index) => {
    const mapped = mapClaimTopic(topic, index);
    const documents = array(topic?.documents, topic?.matchingDocuments).map((document) => ({
      id: text(document?.documentUid, document?.id),
      documentUid: text(document?.documentUid, document?.id),
      name: text(document?.originalFileName, document?.fileName, document?.name, 'Investor document'),
      documentTypeName: text(document?.documentTypeName, document?.documentType?.documentTypeName),
      claimTopicCode: text(document?.claimTopicCode, mapped.claimTopicCode).toUpperCase(),
      uploadedAt: text(document?.uploadedAt, document?.createdAt),
    }));
    const explicitSatisfied = first(topic?.satisfied, topic?.isSatisfied, topic?.eligible);
    const satisfied = explicitSatisfied === undefined ? documents.length > 0 : flag(explicitSatisfied);
    const explicitRejected = first(topic?.rejected, topic?.isRejected);
    const rejected = explicitRejected === undefined
      ? rejectedCodes.includes(mapped.claimTopicCode)
      : flag(explicitRejected);
    const explicitMissing = first(topic?.missing, topic?.isMissing);

    return {
      ...mapped,
      satisfied,
      missing: explicitMissing === undefined ? !satisfied : flag(explicitMissing),
      rejected,
      documents,
    };
  });

  const missingCodes = array(data?.missingClaimTopics, data?.missingTopics)
    .map((item) => (typeof item === 'string' ? item : text(item?.claimTopicCode, item?.code)))
    .filter(Boolean)
    .map((item) => item.toUpperCase());

  const eligibleValue = first(data?.eligible, data?.isEligible);
  const eligible = eligibleValue === undefined
    ? topics.every((topic) => topic.satisfied && !topic.rejected)
    : flag(eligibleValue);

  const rejectionSource = data?.rejection || {};
  const rejectionReasonType = text(
    rejectionSource?.rejectReasonType,
    data?.rejectReasonType,
  ).toUpperCase();
  const rejectionReason = text(rejectionSource?.rejectReason, data?.rejectReason);
  const rejectionClaims = stringList(
    rejectionSource?.rejectedClaim ?? rejectionSource?.rejectedClaims ?? data?.rejectedClaim,
  ).map((item) => item.toUpperCase());
  const hasRejection = Boolean(rejectionReasonType || rejectionReason || rejectionClaims.length);

  return {
    eligible,
    topics,
    missingClaimTopics: missingCodes.length
      ? missingCodes
      : topics.filter((topic) => topic.missing).map((topic) => topic.claimTopicCode || topic.label),
    interestStatus: text(data?.interestStatus, data?.status).toLowerCase(),
    rejection: hasRejection ? {
      rejectReasonType: rejectionReasonType,
      rejectReason: rejectionReason,
      rejectedClaim: rejectionClaims,
      rejectedCount: numberOrNull(rejectionSource?.rejectedCount, data?.rejectedCount),
      canResubmitClaim: numberOrNull(rejectionSource?.canResubmitClaim, data?.canResubmitClaim),
      resubmitRemaining: numberOrNull(rejectionSource?.resubmitRemaining, data?.resubmitRemaining),
      canResubmit: flag(first(rejectionSource?.canResubmit, data?.canResubmit)),
    } : null,
  };
};

export const mapMarketplaceToken = (raw = {}, { interest = null, eligibility = null } = {}) => {
  const tokenUid = text(raw?.tokenUid, raw?.uid, raw?.id);
  const tokenInformation = raw?.tokenInformation || raw?.information || {};
  const pricing = raw?.supplyPricing || raw?.pricing || {};
  const compliance = raw?.compliance || {};
  const organization = raw?.organization || raw?.issuer || raw?.company || {};
  const companyName = typeof organization === 'string'
    ? organization
    : text(
        organization?.legalCompanyName,
        organization?.organizationName,
        organization?.companyName,
        organization?.name,
        organization?.legalName,
        organization?.organizationLegalName,
        organization?.displayName,
        organization?.issuerName,
        raw?.legalCompanyName,
        raw?.companyName,
        raw?.organizationName,
        raw?.issuerName,
        raw?.issuerLegalName,
        raw?.company,
        raw?.organization?.legalCompanyName,
        raw?.organization?.organizationName,
        raw?.organization?.companyName,
        raw?.organization?.name,
        raw?.organization?.legalName,
        raw?.issuer?.legalCompanyName,
        raw?.issuer?.organizationName,
        raw?.issuer?.companyName,
        raw?.issuer?.name,
        raw?.issuer?.legalName,
      );
  const price = numberOrNull(
    raw?.initialTokenPrice,
    raw?.price,
    raw?.initialPrice,
    tokenInformation?.initialTokenPrice,
    tokenInformation?.price,
    pricing?.initialTokenPrice,
    pricing?.initialPrice,
  );
  const requiredClaimTopics = array(raw?.requiredClaimTopics, raw?.claimTopics)
    .map((topic, index) => mapClaimTopic(topic, index));

  return {
    id: tokenUid,
    tokenUid,
    name: text(raw?.name, raw?.tokenName, raw?.tokenDisplayName, tokenInformation?.name) || '—',
    symbol: (text(raw?.symbol, raw?.tokenSymbol, raw?.ticker, tokenInformation?.symbol) || '—').toUpperCase(),
    decimals: numberOrNull(raw?.decimals, tokenInformation?.decimals),
    price,
    nav: numberOrNull(raw?.nav, raw?.netAssetValue, price),
    initialPrice: price,
    currency: text(raw?.currency, pricing?.currency, 'USDT').toUpperCase(),
    description: splitDescription(first(raw?.description, tokenInformation?.description)),
    shortDescription: text(raw?.shortDescription, raw?.description, tokenInformation?.description, tokenInformation?.assetClass),
    issuer: companyName || '—',
    company: companyName || '—',
    legalCompanyName: companyName || '',
    organizationName: companyName || '',
    imageStorageKey: text(
      raw?.imageStorageKey,
      raw?.tokenImageStorageKey,
      raw?.imageKey,
      raw?.tokenImageKey,
      raw?.logoStorageKey,
      tokenInformation?.imageStorageKey,
      tokenInformation?.tokenImageStorageKey,
      tokenInformation?.imageKey,
      tokenInformation?.tokenImageKey,
      tokenInformation?.logoStorageKey,
    ),
    hasImage: flag(raw?.hasImage) || Boolean(text(
      raw?.imageStorageKey,
      raw?.tokenImageStorageKey,
      raw?.imageKey,
      raw?.tokenImageKey,
      raw?.logoStorageKey,
      tokenInformation?.imageStorageKey,
      tokenInformation?.tokenImageStorageKey,
      tokenInformation?.imageKey,
      tokenInformation?.tokenImageKey,
      tokenInformation?.logoStorageKey,
    )),
    imageUrl: text(raw?.imageUrl, raw?.tokenImageUrl, tokenInformation?.imageUrl),
    standard: text(raw?.standard, raw?.tokenStandard, 'ERC-3643'),
    deploymentStatus: text(raw?.status, raw?.deploymentStatus).toLowerCase(),
    assetClass: text(raw?.assetClass, tokenInformation?.assetClass),
    country: text(
      raw?.organizationCountryName,
      raw?.country,
      raw?.countryName,
      organization?.organizationCountryName,
      organization?.countryName,
      organization?.country,
      raw?.organization?.organizationCountryName,
      raw?.issuer?.organizationCountryName,
    ),
    countryCode: text(
      raw?.organizationCountryCode,
      raw?.countryCode,
      raw?.isoCountryCode,
      organization?.organizationCountryCode,
      organization?.countryCode,
      organization?.isoCountryCode,
      raw?.organization?.organizationCountryCode,
      raw?.issuer?.organizationCountryCode,
    ).toUpperCase(),
    organizationCountryName: text(
      raw?.organizationCountryName,
      organization?.organizationCountryName,
      raw?.organization?.organizationCountryName,
      raw?.issuer?.organizationCountryName,
      raw?.country,
      raw?.countryName,
    ),
    organizationCountryCode: text(
      raw?.organizationCountryCode,
      organization?.organizationCountryCode,
      raw?.organization?.organizationCountryCode,
      raw?.issuer?.organizationCountryCode,
      raw?.countryCode,
      raw?.isoCountryCode,
    ).toUpperCase(),
    region: text(raw?.region, organization?.region),
    maxInvestors: numberOrNull(
      raw?.maxHolders,
      raw?.maximumHolders,
      raw?.maxTokenHolders,
      raw?.maxInvestors,
      raw?.maximumInvestors,
      tokenInformation?.maxHolders,
      tokenInformation?.maxInvestors,
      compliance?.maxHolders,
      compliance?.maximumHolders,
      compliance?.maximumInvestors,
    ),
    minInvestment: numberOrNull(raw?.minInvestment, raw?.minimumInvestment, pricing?.minimumInvestment, compliance?.minimumInvestment),
    currentInvestors: numberOrNull(raw?.currentInvestors, raw?.investorCount),
    maxBalance: numberOrNull(
      raw?.maxBalancePerInvestor,
      tokenInformation?.maxBalancePerInvestor,
      pricing?.maxBalancePerInvestor,
      compliance?.maxBalancePerInvestor,
      raw?.maxBalance,
      raw?.maximumBalance,
      compliance?.maximumBalance,
    ),
    expectedApy: text(raw?.expectedApy, raw?.apy),
    liquidity: text(raw?.liquidity, raw?.liquidityType),
    registryAddress: text(raw?.registryAddress, raw?.identityRegistryAddress, raw?.contracts?.identityRegistry),
    onchainId: text(raw?.onchainId, raw?.onchainID, organization?.onchainId, organization?.onchainID),
    permittedCountries: array(raw?.permittedCountries, compliance?.permittedCountries)
      .map((country) => typeof country === 'string' ? country : text(country?.countryName, country?.name))
      .filter(Boolean),
    transferRestriction: text(raw?.transferRestriction, compliance?.transferRestriction),
    documents: array(raw?.documents, raw?.investmentDocuments).map((document, index) => ({
      id: text(document?.documentUid, document?.id, `document-${index}`),
      documentUid: text(document?.documentUid, document?.id),
      name: text(document?.documentName, document?.name, document?.fileName, 'Investment document'),
      type: text(document?.type, document?.mimeType, 'Document'),
      size: text(document?.sizeLabel, document?.fileSize),
      category: text(document?.category, 'offering'),
    })),
    requiredClaimTopics,
    interest,
    eligibility,
  };
};

export const mapInterest = (raw = {}) => {
  const tokenRaw = raw?.token || raw?.tokenSummary || raw?.tokenInvestment || {};
  const tokenUid = text(raw?.tokenUid, tokenRaw?.tokenUid, tokenRaw?.uid, tokenRaw?.id);
  const imageStorageKey = text(
    tokenRaw?.imageStorageKey,
    tokenRaw?.tokenImageStorageKey,
    tokenRaw?.imageKey,
    tokenRaw?.tokenImageKey,
    tokenRaw?.logoStorageKey,
    raw?.imageStorageKey,
    raw?.tokenImageStorageKey,
    raw?.imageKey,
    raw?.tokenImageKey,
    raw?.logoStorageKey,
  );

  // The interests API can return token catalogue fields either nested under `token`
  // or flattened on the interest row. Normalize both shapes without inventing data.
  const tokenSource = {
    ...tokenRaw,
    tokenUid,
    tokenName: first(tokenRaw?.tokenName, tokenRaw?.name, raw?.tokenName, raw?.tokenDisplayName),
    name: first(tokenRaw?.name, tokenRaw?.tokenName, raw?.tokenName, raw?.tokenDisplayName),
    tokenSymbol: first(tokenRaw?.tokenSymbol, tokenRaw?.symbol, raw?.tokenSymbol, raw?.symbol, raw?.ticker),
    symbol: first(tokenRaw?.symbol, tokenRaw?.tokenSymbol, raw?.tokenSymbol, raw?.symbol, raw?.ticker),
    initialTokenPrice: first(
      tokenRaw?.initialTokenPrice,
      tokenRaw?.initialPrice,
      tokenRaw?.price,
      raw?.initialTokenPrice,
      raw?.initialPrice,
      raw?.tokenPrice,
      raw?.price,
    ),
    currency: first(tokenRaw?.currency, raw?.currency, raw?.priceCurrency),
    minInvestment: first(
      tokenRaw?.minInvestment,
      tokenRaw?.minimumInvestment,
      tokenRaw?.minimumInvestmentAmount,
      raw?.minInvestment,
      raw?.minimumInvestment,
      raw?.minimumInvestmentAmount,
    ),
    maxBalancePerInvestor: first(
      tokenRaw?.maxBalancePerInvestor,
      tokenRaw?.maximumBalancePerInvestor,
      tokenRaw?.maxBalance,
      raw?.maxBalancePerInvestor,
      raw?.maximumBalancePerInvestor,
      raw?.maxBalance,
      raw?.maximumBalance,
    ),
    maxHolders: first(
      tokenRaw?.maxHolders,
      tokenRaw?.maximumHolders,
      tokenRaw?.maxInvestors,
      tokenRaw?.maximumInvestors,
      raw?.maxHolders,
      raw?.maximumHolders,
      raw?.maxInvestors,
      raw?.maximumInvestors,
    ),
    legalCompanyName: first(
      tokenRaw?.legalCompanyName,
      tokenRaw?.organization?.legalCompanyName,
      raw?.legalCompanyName,
      raw?.organization?.legalCompanyName,
    ),
    organizationCountryName: first(
      tokenRaw?.organizationCountryName,
      tokenRaw?.organization?.organizationCountryName,
      raw?.organizationCountryName,
      raw?.organization?.organizationCountryName,
    ),
    organizationCountryCode: first(
      tokenRaw?.organizationCountryCode,
      tokenRaw?.organization?.organizationCountryCode,
      raw?.organizationCountryCode,
      raw?.organization?.organizationCountryCode,
    ),
    assetClass: first(tokenRaw?.assetClass, raw?.assetClass),
    imageStorageKey,
    hasImage: first(tokenRaw?.hasImage, raw?.hasImage, Boolean(imageStorageKey)),
    imageUrl: first(tokenRaw?.imageUrl, tokenRaw?.tokenImageUrl, raw?.imageUrl, raw?.tokenImageUrl),
    // Do not treat the interest's pending/approved status as the token deployment status.
    status: first(tokenRaw?.status, raw?.tokenStatus, raw?.deploymentStatus),
    deploymentStatus: first(tokenRaw?.deploymentStatus, raw?.tokenStatus, raw?.deploymentStatus),
  };

  return {
    interestUid: text(raw?.interestUid, raw?.uid, raw?.id),
    tokenUid,
    organizationUid: text(raw?.organizationUid, raw?.organization?.organizationUid),
    investorUid: text(raw?.investorUid, raw?.investor?.investorUid),
    investorUserUid: text(raw?.investorUserUid, raw?.investor?.userUid),
    walletAddress: text(raw?.walletAddress, raw?.investor?.walletAddress),
    status: text(raw?.status, 'pending').toLowerCase(),
    note: text(raw?.note),
    submittedAt: text(raw?.submittedAt, raw?.createdAt),
    decisionAt: text(raw?.decisionAt),
    updatedAt: text(raw?.updatedAt, raw?.decisionAt, raw?.submittedAt, raw?.createdAt),
    rejectReasonType: text(raw?.rejectReasonType, raw?.rejection?.rejectReasonType).toUpperCase(),
    rejectReason: text(raw?.rejectReason, raw?.rejection?.rejectReason),
    rejectedClaim: stringList(raw?.rejectedClaim ?? raw?.rejection?.rejectedClaim ?? raw?.rejection?.rejectedClaims)
      .map((item) => item.toUpperCase()),
    rejectedCount: numberOrNull(raw?.rejectedCount, raw?.rejection?.rejectedCount),
    canResubmitClaim: numberOrNull(raw?.canResubmitClaim, raw?.rejection?.canResubmitClaim),
    resubmitRemaining: numberOrNull(raw?.resubmitRemaining, raw?.rejection?.resubmitRemaining),
    canResubmit: flag(first(raw?.canResubmit, raw?.rejection?.canResubmit)),
    token: mapMarketplaceToken(tokenSource),
    raw,
  };
};

export const mapIssuerInterest = (raw = {}) => {
  const source = raw?.interest && typeof raw.interest === 'object' ? { ...raw.interest, ...raw } : raw;
  const interest = mapInterest(source);
  const investor = source?.investor || source?.investorSummary || source?.identity || {};
  const investorUser = investor?.user || source?.investorUser || source?.user || {};
  const identityStatus = text(
    investor?.identityStatus,
    investor?.verificationStatus,
    investor?.kycStatus,
    investor?.status,
    source?.identityStatus,
  ).toLowerCase();
  const investorName = text(
    investor?.displayName,
    investor?.fullName,
    [investor?.firstName, investor?.lastName].filter(Boolean).join(' '),
    [investorUser?.firstName, investorUser?.lastName].filter(Boolean).join(' '),
    investor?.legalName,
    source?.investorName,
    source?.fullName,
    [source?.firstName, source?.lastName].filter(Boolean).join(' '),
    investorUser?.fullName,
    investorUser?.displayName,
    investorUser?.name,
    'Investor',
  );

  return {
    ...interest,
    id: interest.interestUid,
    investorName,
    investorCode: text(investor?.walletAddress, interest.walletAddress, investor?.email),
    email: text(investor?.email),
    identityStatus: identityStatus || 'submitted',
    onboardingStatus: text(investor?.onboardingStatus, investor?.investorStatus, investor?.status),
    jurisdiction: text(
      source?.organizationCountryName,
      investor?.organizationCountryName,
      investor?.countryName,
      investor?.country,
      source?.jurisdiction,
    ),
    requestedDate: interest.submittedAt,
    requestReference: interest.interestUid,
    tokenName: interest.token.name,
    tokenSymbol: interest.token.symbol,
    investmentAmount: numberOrNull(source?.investmentAmount, source?.amount),
  };
};

export const mapIssuerInterestDetail = (raw = {}) => {
  const source = raw?.interest && typeof raw.interest === 'object' ? { ...raw.interest, ...raw } : raw;
  const base = mapIssuerInterest(source);
  const investor = raw?.investor || source?.investor || raw?.identity || source?.identity || {};
  const investorIdentityAddress = text(
    raw?.investorIdentityAddress,
    raw?.investorOnchainId,
    raw?.investorOnchainID,
    raw?.identityAddress,
    raw?.onchainIdentityAddress,
    raw?.identityContractAddress,
    source?.investorIdentityAddress,
    source?.investorOnchainId,
    source?.investorOnchainID,
    source?.identityAddress,
    source?.onchainIdentityAddress,
    source?.identityContractAddress,
    investor?.investorIdentityAddress,
    investor?.identityAddress,
    investor?.onchainIdentityAddress,
    investor?.identityContractAddress,
    investor?.onchainIdAddress,
    investor?.onchainIDAddress,
    investor?.onchainId,
    investor?.onchainID,
    investor?.identity?.address,
    investor?.identity?.identityAddress,
    investor?.identity?.onchainId,
    investor?.identity?.onchainID,
  );
  const eligibility = mapEligibility(raw?.eligibility || raw?.requiredDocuments || source?.eligibility || raw);
  const documents = array(raw?.documents, raw?.investorDocuments, source?.documents).map((document, index) => ({
    id: text(document?.documentUid, document?.id, `document-${index}`),
    documentUid: text(document?.documentUid, document?.id),
    name: text(document?.documentTypeName, document?.documentType?.documentTypeName, document?.name, 'Investor document'),
    file: text(document?.originalFileName, document?.fileName, document?.name, 'document'),
    size: text(document?.sizeLabel, document?.fileSize, document?.size),
    mimeType: text(document?.mimeType, document?.contentType),
    claimTopicCode: text(document?.claimTopicCode, document?.documentType?.claimTopicCode).toUpperCase(),
    downloadUrl: text(document?.downloadUrl),
    uploadedAt: text(document?.uploadedAt, document?.createdAt),
    versionNumber: numberOrNull(document?.versionNumber),
    submissionNumber: numberOrNull(document?.submissionNumber),
  }));

  const topics = eligibility.topics.map((topic) => ({
    ...topic,
    documents: documents.filter((document) => document.claimTopicCode === topic.claimTopicCode),
  }));

  const resubmissionSource = raw?.resubmissionSummary || source?.resubmissionSummary || {};

  return {
    ...base,
    subscriptionId: text(raw?.subscriptionId, source?.subscriptionId, base.interestUid),
    investorIdentityAddress,
    eligibility: { ...eligibility, topics },
    documents,
    submissionNumber: numberOrNull(raw?.submissionNumber, source?.submissionNumber),
    resubmissionSummary: {
      timesRejected: numberOrNull(resubmissionSource?.timesRejected),
      timesResubmitted: numberOrNull(resubmissionSource?.timesResubmitted),
      rejectedCount: numberOrNull(resubmissionSource?.rejectedCount, raw?.rejectedCount, source?.rejectedCount),
      canResubmitClaim: numberOrNull(resubmissionSource?.canResubmitClaim, raw?.canResubmitClaim, source?.canResubmitClaim),
      resubmitRemaining: numberOrNull(resubmissionSource?.resubmitRemaining, raw?.resubmitRemaining, source?.resubmitRemaining),
      canResubmit: flag(first(resubmissionSource?.canResubmit, raw?.canResubmit, source?.canResubmit)),
    },
  };
};

const mapHistoryDocument = (document = {}, index = 0) => ({
  id: text(document?.submissionDocumentUid, document?.documentUid, document?.id, `history-document-${index}`),
  submissionDocumentUid: text(document?.submissionDocumentUid),
  documentUid: text(document?.documentUid, document?.id),
  documentTypeName: text(document?.documentTypeName, document?.documentType?.documentTypeName, document?.name, 'Investor document'),
  name: text(document?.documentTypeName, document?.documentType?.documentTypeName, document?.name, 'Investor document'),
  originalFileName: text(document?.originalFileName, document?.fileName, document?.file, 'document'),
  file: text(document?.originalFileName, document?.fileName, document?.file, 'document'),
  documentCategory: text(document?.documentCategory, document?.category),
  claimTopicCode: text(document?.claimTopicCode, document?.documentType?.claimTopicCode).toUpperCase(),
  versionNumber: numberOrNull(document?.versionNumber),
  submissionNumber: numberOrNull(document?.submissionNumber),
  mimeType: text(document?.mimeType, document?.contentType),
  fileSize: numberOrNull(document?.fileSize, document?.size),
  size: text(document?.sizeLabel, document?.fileSize, document?.size),
  downloadUrl: text(document?.downloadUrl),
});

export const mapInvestmentHistory = (raw = {}) => {
  const source = raw?.history && typeof raw.history === 'object' ? raw.history : raw;
  const summarySource = source?.summary || {};
  const timeline = array(source?.timeline, source?.events, source?.history).map((event, index) => {
    const eventType = text(event?.eventType, event?.type, event?.status).toLowerCase();
    return {
      id: text(event?.historyUid, event?.eventUid, event?.uid, event?.id) || `${eventType || 'event'}-${text(event?.createdAt, event?.timestamp) || index}-${index}`,
      historyUid: text(event?.historyUid, event?.eventUid, event?.uid, event?.id),
      eventType,
      actorRole: text(event?.actorRole).toLowerCase(),
      actorUserUid: text(event?.actorUserUid),
      actorName: text(
        event?.actorName,
        event?.actorFullName,
        event?.actorDisplayName,
        event?.actor?.fullName,
        event?.actor?.displayName,
        event?.actor?.name,
        event?.actorUser?.fullName,
        event?.actorUser?.displayName,
        event?.actorUser?.name,
      ),
      createdAt: text(event?.createdAt, event?.timestamp, event?.eventAt),
      note: text(event?.note),
      rejectReasonType: text(event?.rejectReasonType).toUpperCase(),
      rejectReason: text(event?.rejectReason),
      rejectedClaim: stringList(event?.rejectedClaim ?? event?.rejectedClaims).map((item) => item.toUpperCase()),
      resubmitAttempt: numberOrNull(event?.resubmitAttempt),
      submissionNumber: numberOrNull(event?.submissionNumber),
      documents: array(event?.documents, event?.submissionDocuments).map(mapHistoryDocument),
      raw: event,
    };
  });

  return {
    interestUid: text(source?.interestUid, raw?.interestUid),
    tokenUid: text(source?.tokenUid, raw?.tokenUid),
    tokenName: text(source?.tokenName, raw?.tokenName),
    tokenSymbol: text(source?.tokenSymbol, raw?.tokenSymbol, source?.symbol, raw?.symbol).toUpperCase(),
    status: text(source?.status, summarySource?.status, raw?.status).toLowerCase(),
    summary: {
      status: text(summarySource?.status, source?.status).toLowerCase(),
      rejectReasonType: text(summarySource?.rejectReasonType, source?.rejectReasonType).toUpperCase(),
      rejectReason: text(summarySource?.rejectReason, source?.rejectReason),
      currentRejectedClaim: stringList(summarySource?.currentRejectedClaim ?? summarySource?.rejectedClaim ?? source?.rejectedClaim).map((item) => item.toUpperCase()),
      rejectedCount: numberOrNull(summarySource?.rejectedCount, source?.rejectedCount),
      canResubmitClaim: numberOrNull(summarySource?.canResubmitClaim, source?.canResubmitClaim),
      resubmitRemaining: numberOrNull(summarySource?.resubmitRemaining, source?.resubmitRemaining),
      canResubmit: flag(first(summarySource?.canResubmit, source?.canResubmit)),
      timesRejected: numberOrNull(summarySource?.timesRejected),
      timesResubmitted: numberOrNull(summarySource?.timesResubmitted),
    },
    timeline,
    raw,
  };
};

export const extractList = (data) => {
  if (Array.isArray(data)) return data;
  return array(data?.items, data?.rows, data?.tokens, data?.interests, data?.results);
};
