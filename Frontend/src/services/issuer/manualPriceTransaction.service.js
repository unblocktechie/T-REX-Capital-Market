/**
 * Request execution of the backend-prepared controller call through the selected
 * wallet connector. The wallet can use its supported on-chain execution format,
 * including a smart-account wrapper; the returned blockchain hash is forwarded
 * to the backend for authoritative verification. Do not re-encode the calldata,
 * change the prepared nonce, or generate a second transaction.
 */
const text = (value) => String(value ?? '').trim();
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})+$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

const asInteger = (value, name) => {
  const str = text(value);
  const n = /^(0x[0-9a-fA-F]+|\d+)$/.test(str) ? BigInt(str) : -1n;
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Invalid prepared ${name}.`);
  return n;
};
const asHex = (n) => `0x${n.toString(16)}`;
const equal = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

export function validatePreparedManualPrice(prepared, { issuerWalletAddress, tokenAddress, chainId } = {}) {
  if (!prepared || typeof prepared !== 'object' || !text(prepared.priceUpdateUid)) {
    throw new Error('The server did not provide a valid saved price-update reference. MetaMask was not opened.');
  }
  if (!['PENDING', 'SUBMITTED'].includes(text(prepared.status).toUpperCase())) {
    throw new Error('This price request is not awaiting a wallet transaction. Refresh its status before continuing.');
  }
  const requestedChain = asInteger(prepared.chainId, 'chain');
  if (chainId && requestedChain !== asInteger(chainId, 'network')) throw new Error('The prepared update belongs to another network.');
  if (!ADDRESS.test(text(prepared.tokenAddress)) || !equal(prepared.tokenAddress, tokenAddress)) {
    throw new Error('The prepared update does not belong to this asset.');
  }
  if (!ADDRESS.test(text(prepared.issuerWalletAddress)) || !equal(prepared.issuerWalletAddress, issuerWalletAddress)) {
    throw new Error('The prepared update belongs to another issuer wallet.');
  }
  if (text(prepared.status).toUpperCase() === 'SUBMITTED') {
    if (!HASH.test(text(prepared.txHash))) throw new Error('The submitted request has no valid transaction hash.');
    return null;
  }
  const request = prepared.transactionRequest;
  if (!request || !ADDRESS.test(text(request.to)) || !ADDRESS.test(text(request.from)) || !HEX_DATA.test(text(request.data))) {
    throw new Error('The server returned incomplete controller transaction details.');
  }
  if (!ADDRESS.test(text(prepared.controllerAddress)) || !equal(request.to, prepared.controllerAddress)) {
    throw new Error('The prepared transaction targets a different Platform Controller.');
  }
  if (!equal(request.from, prepared.issuerWalletAddress)) throw new Error('The prepared sender is not your organization wallet.');
  if (asInteger(request.chainId, 'transaction network') !== requestedChain) throw new Error('The prepared transaction network does not match the saved intent.');
  if (asInteger(request.value, 'native amount') !== 0n) throw new Error('A price update cannot transfer native currency.');
  return {
    to: request.to,
    from: request.from,
    data: request.data,
    value: asHex(0n),
    nonce: asHex(asInteger(request.nonce, 'nonce')),
    chainId: asHex(requestedChain),
  };
}

export async function sendPreparedManualPriceTransaction({
  connector, connectedAddress, issuerWalletAddress, tokenAddress, chainId, prepared, onBeforeBroadcast,
}) {
  const tx = validatePreparedManualPrice(prepared, { issuerWalletAddress, tokenAddress, chainId });
  if (!tx) throw new Error('This request has already been submitted. Resume verification instead.');
  if (!equal(connectedAddress, tx.from)) throw new Error('Connect the approved issuer main wallet before continuing.');
  const provider = await connector?.getProvider?.();
  if (typeof provider?.request !== 'function') throw new Error('Connect a compatible wallet to send this transaction.');
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || !accounts.some((address) => equal(address, tx.from))) {
    throw new Error('The active MetaMask account must be your approved issuer wallet.');
  }
  const walletChainId = await provider.request({ method: 'eth_chainId' });
  if (asInteger(walletChainId, 'wallet network') !== asInteger(tx.chainId, 'prepared network')) {
    throw new Error('Switch MetaMask to the network on the prepared request.');
  }
  // Mark the wallet request as started immediately before invoking it. This
  // callback persists recovery state even if the provider loses its response.
  onBeforeBroadcast?.();
  // The connector's provider determines the on-chain execution format (direct
  // or wallet-managed). Do not replace the prepared controller, nonce or calldata;
  // do not inspect the outer transaction.to as a condition for PATCH verification.
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [tx] });
  if (!HASH.test(text(hash))) throw new Error('The wallet did not return a blockchain transaction hash. Check wallet activity before taking another action; the request may already have been broadcast.');
  return hash;
}

