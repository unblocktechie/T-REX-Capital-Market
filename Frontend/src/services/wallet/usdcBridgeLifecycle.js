const clean = (value) => String(value ?? '').trim();

export const successfulBridgeState = (value) => ['success', 'complete', 'completed'].includes(clean(value).toLowerCase());
export const failedBridgeState = (value) => ['error', 'failed', 'failure', 'rejected', 'cancelled', 'canceled'].includes(clean(value).toLowerCase());

export const normalizeBridgeStepName = (payload) => {
  const raw = clean(payload?.method || payload?.values?.name || payload?.name || payload?.action)
    .replace(/^bridge\./i, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (/approve|approval/.test(raw)) return 'approve';
  if (/burn|deposit/.test(raw)) return 'burn';
  if (/attestation/.test(raw)) return 'attestation';
  if (/mint|receive/.test(raw)) return 'mint';
  return raw;
};

export const bridgeTransactionHash = (payload) => clean(
  payload?.txHash
  || payload?.hash
  || payload?.values?.txHash
  || payload?.values?.hash
  || payload?.data?.txHash
  || payload?.data?.hash
  || payload?.values?.data?.txHash
  || payload?.values?.data?.hash,
);

export const bridgeStepState = (payload) => clean(
  payload?.state
  || payload?.status
  || payload?.values?.state
  || payload?.values?.status
  || payload?.data?.state
  || payload?.data?.status
  || payload?.values?.data?.state
  || payload?.values?.data?.status,
).toLowerCase();

const bridgeAttestation = (payload) => clean(
  payload?.attestation
  || payload?.data?.attestation
  || payload?.values?.attestation
  || payload?.values?.data?.attestation,
);

export const isBridgeStepEventFailed = (payload) => Boolean(
  payload?.error
  || payload?.values?.error
  || payload?.data?.error
  || failedBridgeState(bridgeStepState(payload)),
);

export const isBridgeStepEventComplete = (payload) => {
  if (!payload || isBridgeStepEventFailed(payload)) return false;
  const name = normalizeBridgeStepName(payload);
  const state = bridgeStepState(payload);
  if (name === 'attestation') return successfulBridgeState(state) || Boolean(bridgeAttestation(payload));
  if (['approve', 'burn', 'mint'].includes(name)) {
    // For wallet-backed transaction steps, a transaction hash is the important
    // boundary: MetaMask cannot provide it until the user has confirmed the
    // request and the wallet has actually submitted the transaction.
    return Boolean(bridgeTransactionHash(payload)) && (!state || successfulBridgeState(state));
  }
  return successfulBridgeState(state);
};

export const isUsdcBridgeResultComplete = (result) => {
  if (!result || !successfulBridgeState(result.state)) return false;
  const steps = Array.isArray(result.steps) ? result.steps : [];
  if (steps.some((step) => step?.error || failedBridgeState(bridgeStepState(step)))) return false;

  // Do not trust the top-level `state: success` on its own. With browser wallets
  // and EIP-5792 batching the SDK can surface a successful orchestration state
  // while the destination mint confirmation is still being presented by the
  // wallet. The modal is complete only after the final mint step itself is
  // successful and has a submitted destination transaction hash.
  const mintStep = steps.find((step) => normalizeBridgeStepName(step) === 'mint');
  return Boolean(
    mintStep
    && successfulBridgeState(bridgeStepState(mintStep))
    && bridgeTransactionHash(mintStep),
  );
};
