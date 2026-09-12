import { getAddress, isAddress } from 'viem';
import { investmentApi } from '@/api/investments';
import { web3Config } from '@/config/web3';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const clean = (value) => String(value ?? '').trim();

const normalizeAddress = (value) => {
  const normalized = clean(value);
  if (!isAddress(normalized)) return '';
  return getAddress(normalized);
};

const firstText = (...values) => clean(values.find((value) => value !== undefined && value !== null && clean(value)) || '');

const rawAddress = (raw, ...keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], raw);
    const normalized = normalizeAddress(value);
    if (normalized) return normalized;
  }
  return '';
};

const tokenUidFromRecord = (token) => firstText(token?.tokenUid, token?.uid, token?.id);
const tokenContractAddress = (token) => rawAddress(
  token,
  'tokenAddress',
  'contractAddress',
  'proxyAddress',
  'contracts.token',
  'deployment.contracts.token',
  'deployment.tokenAddress',
  'deployment.contractAddress',
);

const issuerWalletsFromRecords = ({ token, organization, extraWallets = [] }) => [...new Set([
  token?.tokenInformation?.treasuryWalletAddress,
  token?.tokenInformation?.treasuryWallet,
  token?.information?.treasuryWalletAddress,
  token?.information?.treasuryWallet,
  token?.treasuryWallet,
  token?.treasuryWalletAddress,
  token?.tokenAgentWalletAddress,
  token?.identityManagerWalletAddress,
  token?.agents?.tokenOperationsWallet,
  token?.agents?.tokenOperationsWalletAddress,
  token?.governance?.tokenAgentWalletAddress,
  token?.governance?.tokenAgent?.address,
  token?.governance?.tokenOperationsWallet,
  token?.governance?.tokenOperationsWalletAddress,
  token?.agents?.investorVerificationManager,
  token?.agents?.identityManagerWallet,
  token?.governance?.identityManagerWalletAddress,
  token?.governance?.identityRegistryAgent?.address,
  organization?.walletAddress,
  organization?.organizationWallet,
  organization?.masterWalletAddress,
  ...extraWallets,
].map(normalizeAddress).filter(Boolean))];

const amountOf = (row) => firstText(
  row?.tokenAmountFormatted,
  row?.amountFormatted,
  row?.tokenAmount,
  row?.amount,
  row?.tokenAmountRaw,
  '0',
);

const timestampOf = (row) => {
  const value = row?.blockTimestamp || row?.confirmedAt || row?.createdAt || row?.timestamp;
  if (!value) return null;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const classifyActivity = ({ row, from, to, issuerAddresses }) => {
  const type = clean(row?.type || row?.action || row?.expectedAction).toUpperCase();
  if (type === 'INVEST' || type === 'TOKEN_ISSUE' || from.toLowerCase() === ZERO_ADDRESS) {
    return { type: 'issued', label: type === 'INVEST' ? 'Investment completed' : 'Tokens issued' };
  }
  if (type === 'REDEMPTION' || type === 'TOKEN_BURN' || to.toLowerCase() === ZERO_ADDRESS) {
    return { type: 'redeemed', label: 'Tokens redeemed' };
  }
  const issuerSet = new Set(issuerAddresses.map((address) => address.toLowerCase()));
  if (issuerSet.has(from.toLowerCase()) && !issuerSet.has(to.toLowerCase())) return { type: 'sent', label: 'Sent by issuer' };
  if (issuerSet.has(to.toLowerCase()) && !issuerSet.has(from.toLowerCase())) return { type: 'received', label: 'Received by issuer' };
  return { type: 'transfer', label: 'Investor transfer' };
};

const normalizedRow = (row, issuerAddresses, fallbackChainId) => {
  const from = normalizeAddress(row?.fromWallet || row?.from || row?.initiatedByWallet) || ZERO_ADDRESS;
  const to = normalizeAddress(row?.toWallet || row?.to || row?.recipientWalletAddress) || ZERO_ADDRESS;
  const activity = classifyActivity({ row, from, to, issuerAddresses });
  const amountExact = amountOf(row);
  return {
    ...row,
    id: firstText(row?.id, `${row?.transactionHash || row?.txHash || 'tx'}-${row?.logIndex ?? row?.type ?? 'event'}`),
    transactionHash: firstText(row?.transactionHash, row?.txHash),
    timestamp: timestampOf(row),
    from,
    to,
    amountExact,
    amountDisplay: amountExact,
    activityType: activity.type,
    activityLabel: activity.label,
    status: clean(row?.status || 'CONFIRMED').toLowerCase(),
    chainId: Number(row?.chainId || fallbackChainId || web3Config.requiredChain.id),
  };
};

const metaPages = (meta, rowCount) => {
  const total = Number(meta?.total ?? meta?.totalItems ?? meta?.count ?? rowCount) || rowCount;
  const totalPages = Math.max(1, Number(meta?.totalPages ?? meta?.pages ?? Math.ceil(total / 100)) || 1);
  return { total, totalPages };
};

export const issuerTokenTransactionHistoryService = Object.freeze({
  getTokenContractAddress: tokenContractAddress,

  getIssuerWallets({ token, organization, extraWallets } = {}) {
    return issuerWalletsFromRecords({ token, organization, extraWallets });
  },

  async list({ token, organization, chainId, extraIssuerWallets = [] } = {}) {
    const tokenUid = tokenUidFromRecord(token);
    if (!tokenUid) throw new Error('The investment asset identifier is not available yet.');
    const issuerAddresses = issuerWalletsFromRecords({ token, organization, extraWallets: extraIssuerWallets });
    const rows = [];
    let page = 1;
    let totalPages = 1;
    do {
      // Canonical history is maintained by the backend/indexer. The browser no
      // longer scans Transfer logs directly or reconstructs chain history itself.
      // eslint-disable-next-line no-await-in-loop
      const result = await investmentApi.listTransactions({ page, limit: 100, tokenUid });
      rows.push(...(Array.isArray(result?.data) ? result.data : []));
      totalPages = metaPages(result?.meta, result?.data?.length || 0).totalPages;
      page += 1;
    } while (page <= totalPages && page <= 50);

    const resolvedChainId = Number(chainId || token?.chainId || token?.deployment?.chainId || web3Config.requiredChain.id);
    return {
      rows: rows.map((row) => normalizedRow(row, issuerAddresses, resolvedChainId)),
      issuerAddresses,
      chainId: resolvedChainId,
      networkName: web3Config.supportedChains.find((item) => item.id === resolvedChainId)?.name || '',
      completeHistory: true,
    };
  },

  async export({ token, search = '', type = '', status = '', fromDate = '', toDate = '' } = {}) {
    const tokenUid = tokenUidFromRecord(token);
    if (!tokenUid) throw new Error('The investment asset identifier is not available yet.');
    return investmentApi.exportTransactions({ tokenUid, search, type, status, fromDate, toDate });
  },
});
