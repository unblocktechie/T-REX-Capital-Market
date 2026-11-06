// Service Wallet registration is scoped by both token and network. The old
// organization-wide alias is retained for audits but must never authorize a token.
const text = (value) => String(value ?? '').trim();
const ZERO = /^0x0{40}$/i;

export const normalizeTokenServiceWallets = (rows) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    tokenUid: text(row?.tokenUid || row?.token?.tokenUid),
    chainUid: text(row?.chainUid || row?.chain?.chainUid),
    serviceWalletAddress: text(row?.serviceWalletAddress || row?.walletAddress || row?.address),
  })).filter((row) => row.tokenUid && row.chainUid);

export const tokenServiceWalletAddress = (rows, tokenUid, chainUid) => {
  const token = text(tokenUid).toLowerCase();
  const chain = text(chainUid).toLowerCase();
  if (!token || !chain) return '';
  const record = normalizeTokenServiceWallets(rows).find((row) =>
    row.tokenUid.toLowerCase() === token && row.chainUid.toLowerCase() === chain
  );
  const address = text(record?.serviceWalletAddress);
  return ZERO.test(address) ? '' : address;
};

export const updateTokenServiceWallet = (rows, tokenUid, chainUid, serviceWalletAddress) => {
  const token = text(tokenUid);
  const chain = text(chainUid);
  if (!token || !chain) throw new Error('Token and network are required for Service Wallet synchronization.');
  const current = normalizeTokenServiceWallets(rows);
  const filtered = current.filter((row) =>
    row.tokenUid.toLowerCase() !== token.toLowerCase() ||
    row.chainUid.toLowerCase() !== chain.toLowerCase()
  );
  const address = text(serviceWalletAddress);
  if (!address || ZERO.test(address)) return filtered;
  return [...filtered, { tokenUid: token, chainUid: chain, serviceWalletAddress: address }];
};
