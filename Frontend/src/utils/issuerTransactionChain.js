// Issuer activity links must be pinned to the transaction's network (or the
// deployed token's network), never to the application's default chain.
const positiveChainId = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const firstChainId = (...values) => values.map(positiveChainId).find(Boolean) || null;

const chainIdFromUid = (chainUid, chainRecords) => {
  const uid = String(chainUid ?? '').trim();
  if (!uid) return null;
  return positiveChainId(chainRecords.find((chain) => chain.chainUid === uid)?.chainId);
};

export const resolveIssuerTokenHistoryChainId = (token, chainRecords = [], requestedChainId) => {
  const information = token?.tokenInformation || token?.information || {};
  return firstChainId(
    requestedChainId,
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
  ) || chainIdFromUid(
    token?.chainUid || token?.deployment?.chainUid || token?.chain?.chainUid ||
      token?.network?.chainUid || information?.chainUid ||
      information?.chain?.chainUid || information?.network?.chainUid,
    chainRecords,
  );
};

export const resolveIssuerTransactionChainId = (row, tokenChainId, chainRecords = []) =>
  firstChainId(
    row?.chainId,
    row?.networkChainId,
    row?.chain?.chainId,
    row?.network?.chainId,
  ) || chainIdFromUid(
    row?.chainUid || row?.chain?.chainUid || row?.network?.chainUid,
    chainRecords,
  ) || positiveChainId(tokenChainId);
