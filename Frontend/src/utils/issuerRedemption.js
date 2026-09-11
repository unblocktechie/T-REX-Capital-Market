export const cleanRedemptionText = (value) => String(value ?? '').trim();
export const issuerRedemptionUid = (item) => cleanRedemptionText(item?.redemptionUid || item?.uid || item?.id);
export const issuerRedemptionStatus = (item) => cleanRedemptionText(item?.status).toUpperCase();

export const redemptionRejectionReason = (item) => cleanRedemptionText(
  item?.issuerDecision?.rejectionReason
  || item?.issuerDecision?.reason
  || item?.rejectionReason
  || item?.rejection?.reason
  || item?.decision?.rejectionReason
  || item?.decision?.reason,
);

export const issuerRedemptionList = (payload) => {
  if (Array.isArray(payload)) return payload;
  const list = payload?.items || payload?.rows || payload?.redemptions || payload?.results || payload?.data;
  return Array.isArray(list) ? list : [];
};

export const issuerRedemptionStatusMeta = (status) => {
  switch (cleanRedemptionText(status).toUpperCase()) {
    case 'PENDING_INVESTOR_AUTHORIZATION': return { label: 'Awaiting investor confirmation', tone: 'pending' };
    case 'PENDING_ISSUER_APPROVAL': return { label: 'Awaiting approval', tone: 'pending' };
    case 'TOKENS_LOCKED': return { label: 'Payment required', tone: 'success' };
    case 'PAYMENT_SUBMITTED': return { label: 'Payment sent', tone: 'pending' };
    case 'BURN_SUBMITTED': return { label: 'Finalizing redemption', tone: 'pending' };
    case 'COMPLETED': return { label: 'Completed', tone: 'success' };
    case 'ISSUER_REJECTED': return { label: 'Rejected', tone: 'danger' };
    case 'CANCELLATION_PENDING': return { label: 'Cancellation in progress', tone: 'pending' };
    case 'CANCELLED': return { label: 'Cancelled', tone: 'neutral' };
    case 'EXPIRED': return { label: 'Expired', tone: 'neutral' };
    case 'MANUAL_REVIEW': return { label: 'Support review required', tone: 'danger' };
    default: return { label: cleanRedemptionText(status).replaceAll('_', ' ') || 'Pending', tone: 'neutral' };
  }
};

export const issuerPaymentStatus = (item) => cleanRedemptionText(item?.payment?.status || item?.paymentStatus).toUpperCase();
export const issuerPaymentHash = (item) => cleanRedemptionText(item?.payment?.txHash || item?.paymentTxHash || item?.issuerPaymentTxHash || item?.verifiedIssuerPaymentHash);
export const issuerBurnHash = (item) => cleanRedemptionText(item?.burn?.txHash || item?.burnTxHash || item?.platformBurnTxHash || item?.verifiedPlatformBurnHash);
export const issuerLockHash = (item) => cleanRedemptionText(item?.lock?.txHash || item?.lockTxHash || item?.platformLockTxHash);

export const issuerRedemptionTokenLabel = (item) => {
  const name = cleanRedemptionText(item?.tokenName || item?.token?.name);
  const symbol = cleanRedemptionText(item?.tokenSymbol || item?.token?.symbol).toUpperCase();
  if (name && symbol) return `${name} (${symbol})`;
  return name || symbol || 'Token';
};

export const issuerRedemptionInvestorLabel = (item) => {
  const investor = item?.investor || item?.investorProfile || item?.investorDetails || {};
  const user = item?.investorUser || investor?.user || investor?.userProfile || {};
  const joinedName = (...values) => values.map(cleanRedemptionText).filter(Boolean).join(' ');

  return cleanRedemptionText(
    item?.investorName
    || item?.investorFullName
    || investor?.fullName
    || investor?.name
    || joinedName(investor?.firstName, investor?.lastName)
    || user?.fullName
    || user?.name
    || joinedName(user?.firstName, user?.lastName)
    || joinedName(item?.investorFirstName, item?.investorLastName)
    || item?.requestedBy?.fullName
    || item?.requestedBy?.name,
  ) || 'Investor';
};

export const issuerRedemptionAmountLabel = (item) => {
  const amount = cleanRedemptionText(item?.tokenAmount || item?.amount || item?.redeemAmount);
  const symbol = cleanRedemptionText(item?.tokenSymbol || item?.token?.symbol).toUpperCase();
  return amount ? `${amount}${symbol ? ` ${symbol}` : ''}` : '—';
};
