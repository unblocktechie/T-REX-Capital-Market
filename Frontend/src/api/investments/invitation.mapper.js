const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const text = (...values) => String(first(...values, '') || '').trim();
const array = (...values) => values.find(Array.isArray) || [];
const boolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const invitationSource = (raw = {}) => raw?.invitation || raw?.currentInvitation || raw?.investorInvitation || raw?.invitationState || null;
const tokenSource = (raw = {}) => raw?.token || raw?.tokenDetail || raw?.marketplaceTokenDetail || raw?.marketplaceToken || raw?.offering || {};
const organizationSource = (raw = {}) => raw?.organization || raw?.issuerOrganization || raw?.issuer?.organization || raw?.issuer || raw?.company || {};

export const extractInvitationList = (data) => {
  if (Array.isArray(data)) return data;
  return array(data?.items, data?.rows, data?.investors, data?.invitations, data?.results);
};

export const normalizeInvitationMeta = (meta = {}, { page = 1, limit = 20, itemCount = 0 } = {}) => {
  const source = meta?.pagination && typeof meta.pagination === 'object' ? meta.pagination : meta;
  const safePage = Math.max(1, Number(source?.page ?? source?.currentPage ?? page) || 1);
  const safeLimit = Math.max(1, Number(source?.limit ?? source?.pageSize ?? source?.perPage ?? limit) || limit);
  const total = Math.max(0, Number(source?.total ?? source?.totalItems ?? source?.count ?? itemCount) || 0);
  const totalPages = Math.max(1, Number(source?.totalPages ?? source?.pages ?? Math.ceil(total / safeLimit)) || 1);
  return { page: Math.min(safePage, totalPages), limit: safeLimit, total, totalPages };
};

export const mapInvitation = (raw = {}) => {
  const nestedSource = invitationSource(raw);
  const hasNestedSource = Boolean(nestedSource && typeof nestedSource === 'object' && !Array.isArray(nestedSource));
  const topStatus = text(raw?.invitationStatus, raw?.status).toUpperCase();
  const looksLikeInvitation = hasNestedSource || Boolean(
    raw?.invitationUid
    || raw?.emailStatus
    || raw?.emailDeliveryStatus
    || raw?.marketplaceUrl
    || ['PENDING', 'SENT', 'VIEWED'].includes(topStatus),
  );
  const nested = hasNestedSource ? nestedSource : raw;
  const status = looksLikeInvitation
    ? text(nested?.status, nested?.invitationStatus, raw?.invitationStatus).toUpperCase()
    : '';
  const emailStatus = looksLikeInvitation
    ? text(nested?.emailStatus, nested?.emailDeliveryStatus, nested?.deliveryStatus, raw?.emailStatus, raw?.emailDeliveryStatus).toUpperCase()
    : '';

  return {
    invitationUid: looksLikeInvitation ? text(nested?.invitationUid, nested?.uid, nested?.id, raw?.invitationUid) : '',
    status,
    emailStatus,
    sentAt: text(nested?.sentAt, nested?.emailedAt, nested?.deliveredAt, raw?.sentAt),
    viewedAt: text(nested?.viewedAt, raw?.viewedAt),
    createdAt: looksLikeInvitation ? text(nested?.createdAt, raw?.createdAt) : '',
    updatedAt: looksLikeInvitation ? text(nested?.updatedAt, raw?.updatedAt) : '',
    attemptCount: Number(first(nested?.attemptCount, nested?.emailAttemptCount, raw?.attemptCount, 0)) || 0,
    diagnostic: text(nested?.latestDiagnostic, nested?.diagnostic, nested?.emailError, nested?.failureReason, raw?.diagnostic),
    processing: looksLikeInvitation && boolean(first(raw?.processing, nested?.processing), emailStatus === 'PROCESSING'),
    alreadyExisted: looksLikeInvitation && boolean(first(raw?.alreadyExisted, nested?.alreadyExisted), false),
    raw: looksLikeInvitation ? nested : {},
  };
};

export const mapIssuerInvestor = (raw = {}) => {
  const investor = raw?.investor && typeof raw.investor === 'object' ? raw.investor : {};
  const user = raw?.user || investor?.user || investor || {};
  const profile = raw?.profile || raw?.investorProfile || investor?.profile || investor?.investorProfile || user?.investorProfile || {};
  const identity = raw?.identity || profile?.identity || profile?.identityDetails || profile?.personalDetails || profile;
  const contact = raw?.contact || profile?.contact || user?.contact || investor?.contact || {};
  const address = raw?.address || raw?.location || profile?.address || profile?.location || identity?.address || {};
  const compliance = raw?.compliance || profile?.compliance || investor?.compliance || {};
  const wallet = raw?.wallet || profile?.wallet || investor?.wallet || {};
  const invitation = mapInvitation(raw);
  const firstName = text(identity?.firstName, profile?.firstName, user?.firstName, investor?.firstName, raw?.firstName);
  const lastName = text(identity?.lastName, profile?.lastName, user?.lastName, investor?.lastName, raw?.lastName);
  const fullName = text(
    raw?.investorName,
    raw?.fullName,
    identity?.fullName,
    profile?.fullName,
    user?.fullName,
    user?.name,
    [firstName, lastName].filter(Boolean).join(' '),
  ) || 'Investor';

  const eligibleValue = first(raw?.eligibleForInvitation, raw?.invitationEligibility?.eligible, raw?.eligibility?.eligible);

  return {
    investorUid: text(raw?.investorUid, raw?.userUid, user?.userUid, user?.uid, profile?.investorUid, profile?.uid, raw?.uid, raw?.id),
    profileUid: text(raw?.profileUid, profile?.profileUid, profile?.uid),
    name: fullName,
    email: text(raw?.email, contact?.email, user?.email, investor?.email, profile?.email),
    phone: text(raw?.phone, raw?.phoneNumber, contact?.phone, contact?.phoneNumber, identity?.phoneNumber, profile?.phoneNumber),
    country: text(raw?.countryName, raw?.country, address?.countryName, address?.country, identity?.countryName, identity?.country, profile?.countryName, profile?.country),
    countryCode: text(raw?.countryCode, address?.countryCode, identity?.countryCode, profile?.countryCode).toUpperCase(),
    city: text(raw?.city, address?.city, identity?.city, profile?.city),
    walletAddress: text(raw?.walletAddress, raw?.investorWalletAddress, wallet?.address, wallet?.walletAddress, profile?.walletAddress, investor?.walletAddress, user?.walletAddress),
    onchainIdentityAddress: text(raw?.onchainIdentityAddress, raw?.onchainIdAddress, raw?.onchainIDAddress, wallet?.onchainIdentityAddress, wallet?.onchainIdAddress, profile?.onchainIdentityAddress, profile?.onchainIdAddress),
    complianceStatus: text(raw?.complianceStatus, compliance?.status, profile?.complianceStatus),
    invitation,
    eligibleForInvitation: boolean(eligibleValue, false),
    eligibilityCode: text(raw?.eligibilityCode, raw?.stableEligibilityCode, raw?.invitationEligibility?.code, raw?.eligibility?.code),
    eligibilityMessage: text(raw?.eligibilityMessage, raw?.displayMessage, raw?.invitationEligibility?.message, raw?.eligibility?.message),
    investmentInterest: raw?.investmentInterest || raw?.existingInvestmentInterest || raw?.interest || null,
    raw,
  };
};

export const mapInvestorInvitation = (raw = {}) => {
  const invitation = mapInvitation(raw);
  const token = tokenSource(raw);
  const tokenInfo = token?.tokenInformation || token?.information || token;
  const organization = organizationSource(raw);
  const issuer = raw?.issuer && typeof raw.issuer === 'object' ? raw.issuer : {};
  const tokenUid = text(raw?.tokenUid, token?.tokenUid, token?.uid, token?.id);
  const companyName = text(
    raw?.issuerCompany,
    raw?.companyName,
    organization?.legalCompanyName,
    organization?.organizationName,
    organization?.companyName,
    organization?.name,
    issuer?.companyName,
    issuer?.organizationName,
    issuer?.name,
  ) || 'Issuer';

  return {
    ...invitation,
    tokenUid,
    token: {
      ...token,
      id: tokenUid,
      tokenUid,
      name: text(token?.name, token?.tokenName, tokenInfo?.name, tokenInfo?.tokenName) || 'Token',
      symbol: text(token?.symbol, token?.tokenSymbol, tokenInfo?.symbol, tokenInfo?.tokenSymbol).toUpperCase(),
      imageUrl: text(token?.imageUrl, token?.tokenImageUrl, tokenInfo?.imageUrl),
      imageStorageKey: text(token?.imageStorageKey, token?.tokenImageStorageKey, tokenInfo?.imageStorageKey, tokenInfo?.tokenImageStorageKey),
      hasImage: boolean(first(token?.hasImage, tokenInfo?.hasImage), Boolean(text(token?.imageUrl, token?.imageStorageKey, tokenInfo?.imageUrl, tokenInfo?.imageStorageKey))),
      status: text(token?.status, token?.deploymentStatus).toLowerCase(),
      assetClass: text(token?.assetClass, tokenInfo?.assetClass),
    },
    issuer: {
      ...issuer,
      companyName,
      name: text(issuer?.name, raw?.issuerName),
    },
    organization: {
      ...(organization && typeof organization === 'object' ? organization : {}),
      companyName,
    },
    companyName,
    marketplaceUrl: text(raw?.marketplaceUrl, raw?.url, invitation.raw?.marketplaceUrl),
    raw,
  };
};
