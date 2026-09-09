# Frontend guide: investor claim Retry flow

This guide describes the frontend changes required for the hybrid investor-claim recovery flow.
The main rule is simple:

> Never open MetaMask immediately when the investor clicks Retry. Call the Retry API first and
> open the wallet only when the backend returns `TRANSACTION_REQUIRED`.

The backend treats the blockchain as the source of truth and never creates a claim transaction.
Retry is idempotent and updates the existing claim submission.

## Endpoints used by the screen

```http
GET  /api/v1/investor/claims?interestId={interestId}
POST /api/v1/investor/claims/{claimId}/prepare
POST /api/v1/investor/claims/{claimId}/submit
POST /api/v1/investor/claims/{claimId}/retry
Authorization: Bearer {investorToken}
```

Request bodies:

```ts
type ClaimInterestRequest = {
  interestId: string;
};

type ClaimSubmitRequest = {
  interestId: string;
  txHash: `0x${string}`;
};
```

Do not send wallet addresses, identity addresses, topic, data, signature, status, or investor UID.
The backend loads those trusted values from the database.

## Frontend state model

Use the backend workflow status instead of deriving state from the HTTP status alone:

```ts
type ClaimWorkflowStatus =
  | 'CONFIRMED'
  | 'PENDING_CONFIRMATION'
  | 'SYNCING'
  | 'TRANSACTION_REQUIRED';

type ClaimRecordStatus = 'notInitiated' | 'PENDING' | 'CONFIRMED' | 'FAILED';
type ClaimSyncStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'FAILED' | null;

type ClaimListItem = {
  claimId: string;
  claimTopic: number;
  data: string;
  signature: string;
  status: ClaimRecordStatus;
  syncStatus: ClaimSyncStatus;
  txHash: string | null;
};

type RetryData = {
  status: ClaimWorkflowStatus;
  detected: boolean;
  claim: {
    claimId: string;
    claimTopic: number;
    status: 'PENDING' | 'CONFIRMED' | 'FAILED';
    txHash: string | null;
    confirmedAt: string | null;
  };
  application: {
    interestId: string;
    status: string;
    totalRequiredClaims: number;
    confirmedClaims: number;
    pendingClaims: number;
  };
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
  requestId: string;
};
```

## Required behavior for each status

| Backend status | Frontend behavior | Open MetaMask? |
|---|---|---:|
| `CONFIRMED` | Mark the claim complete, stop polling, refresh application progress | No |
| `PENDING_CONFIRMATION` | Show “Transaction is confirming”; retry with controlled backoff | No |
| `SYNCING` | Show “Synchronizing on-chain claim”; poll the claim list | No |
| `TRANSACTION_REQUIRED` | Call Prepare, then request the wallet transaction | **Yes** |

`detected: true` means the backend found the exact claim or confirmed transaction state. It does
not always mean DB synchronization has finished; use `data.status` as the UI decision field.

## Recommended Retry click flow

```ts
async function handleClaimRetry(interestId: string, claimId: string) {
  if (claimUiState[claimId]?.isRetrying) return;

  setClaimUiState(claimId, { isRetrying: true, error: null });

  try {
    const response = await api.post<ApiEnvelope<RetryData>>(
      `/api/v1/investor/claims/${claimId}/retry`,
      { interestId },
    );

    switch (response.data.data.status) {
      case 'CONFIRMED':
        stopClaimPolling(claimId);
        updateClaimFromRetry(response.data.data);
        showSuccess('Claim submitted and confirmed.');
        await refreshInvestmentApplication(interestId);
        return;

      case 'PENDING_CONFIRMATION':
        updateClaimFromRetry(response.data.data);
        showInfo('Your transaction is still confirming on-chain.');
        startConfirmationPolling(interestId, claimId);
        return;

      case 'SYNCING':
        updateClaimFromRetry(response.data.data);
        showInfo('Your on-chain claim was found. Synchronization is in progress.');
        startDatabaseStatusPolling(interestId, claimId);
        return;

      case 'TRANSACTION_REQUIRED':
        await prepareAndSubmitWalletClaim(interestId, claimId);
        return;
    }
  } catch (error) {
    handleRetryApiError(error, interestId, claimId);
  } finally {
    setClaimUiState(claimId, { isRetrying: false });
  }
}
```

Disable Retry and Submit buttons while a request or wallet action for that claim is in progress.
Maintain one in-flight operation per `claimId` to prevent double-click races.

## Prepare and wallet submission

Call Prepare immediately before requesting a new wallet transaction. This refreshes the trusted
parameters and records a narrow recovery starting block.

```ts
type PreparedClaim = {
  submissionUid: string;
  claimId: string;
  claimTopic: number;
  data: string;
  signature: string;
  investorIdentityAddress: string;
  issuerIdentityAddress: string;
  status: 'PENDING' | 'CONFIRMED';
  alreadyConfirmed: boolean;
};

async function prepareAndSubmitWalletClaim(interestId: string, claimId: string) {
  const preparedResponse = await api.post<ApiEnvelope<PreparedClaim>>(
    `/api/v1/investor/claims/${claimId}/prepare`,
    { interestId },
  );
  const prepared = preparedResponse.data.data;

  if (prepared.alreadyConfirmed || prepared.status === 'CONFIRMED') {
    await refreshClaims(interestId);
    return;
  }

  // Reuse the application's existing ONCHAINID addClaim transaction implementation.
  const transaction = await submitClaimThroughWallet({
    identityAddress: prepared.investorIdentityAddress,
    topic: prepared.claimTopic,
    scheme: 1,
    issuer: prepared.issuerIdentityAddress,
    signature: prepared.signature,
    data: prepared.data,
    uri: '',
  });

  // Send the hash as soon as the wallet broadcasts it. Do not wait for many confirmations before
  // persisting the hash; the backend safely returns PENDING_CONFIRMATION when it is not mined yet.
  await confirmBroadcastHash(interestId, claimId, transaction.hash);
}
```

If the wallet is rejected before broadcast, do not call Submit. Show “Transaction cancelled” and
allow the user to try again. If the wallet broadcast succeeds but the page closes before Submit,
Retry will discover the claim and synchronize its real event hash.

## Handling the Submit response

```ts
async function confirmBroadcastHash(interestId: string, claimId: string, txHash: string) {
  const response = await api.post<ApiEnvelope<{
    status: 'CONFIRMED' | 'PENDING_CONFIRMATION';
    claim: RetryData['claim'];
    application: RetryData['application'];
  }>>(`/api/v1/investor/claims/${claimId}/submit`, { interestId, txHash });

  if (response.data.data.status === 'CONFIRMED') {
    stopClaimPolling(claimId);
    await refreshClaims(interestId);
    await refreshInvestmentApplication(interestId);
    return;
  }

  // HTTP 202 is a successful accepted response, not an exception.
  showInfo('Transaction submitted. Waiting for blockchain confirmation.');
  startConfirmationPolling(interestId, claimId);
}
```

Axios accepts HTTP `202` by default. If your shared client accepts only `200`, update its
`validateStatus` behavior so every `2xx` response is treated as success.

## Polling strategy

### After `SYNCING`

Poll the lightweight list endpoint rather than repeatedly calling Retry:

```http
GET /api/v1/investor/claims?interestId={interestId}
```

Recommended settings:

- Poll every 5 seconds.
- Stop when that claim has `status: CONFIRMED`.
- Stop on component unmount, navigation, logout, or application completion.
- After 90 seconds, stop automatic polling and show “Synchronization is still running” with a
  manual Retry button. Do not open the wallet automatically.
- Prevent overlapping polling requests with an `AbortController` or an in-flight flag.

The backend workers normally run every 15 seconds, so sub-second polling provides no benefit.

### After `PENDING_CONFIRMATION`

Retry receipt verification with controlled backoff, for example after 5, 10, 15, and then every
15 seconds up to 90 seconds. Each call is idempotent. Stop immediately if the response changes to
`CONFIRMED`, `SYNCING`, or `TRANSACTION_REQUIRED`.

Do not treat a polling timeout as a failed transaction. Keep the known transaction hash visible and
offer a block-explorer link plus a manual “Check status” action.

## Initial page load and resume

On page load:

1. Fetch `GET /investor/claims?interestId=...`.
2. Render `notInitiated` with a primary “Submit claim” action.
3. Render `PENDING + txHash` as “Confirming” and offer “Check status”.
4. Render `PENDING + syncStatus QUEUED/PROCESSING` as “Synchronizing” and resume DB polling.
5. Render `PENDING + no txHash` with “Retry”. Do not assume a new transaction is required.
6. Render `CONFIRMED` as complete and disable transaction actions.
7. Render `FAILED` with the backend message and a Retry action; Retry still checks blockchain state
   before a replacement transaction.

Do not store `CONFIRMED` permanently in browser storage. Refresh authoritative state from the API
after reload, wallet/network changes, and application-status changes.

## Error handling

Backend errors use:

```ts
type ApiErrorEnvelope = {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
  timestamp: string;
  requestId: string;
};
```

Recommended handling:

| HTTP/code | Frontend action |
|---|---|
| `404 CLAIM_SUBMISSION_NOT_PREPARED` | Call Prepare; do not call Retry again first |
| `503 RPC_UNAVAILABLE` | Show temporary provider error and a “Check again” action; do not open wallet |
| `401 UNAUTHORIZED` | Refresh authentication or route to login |
| `403 FORBIDDEN` | Show access error; do not expose claim controls |
| `409 CONFLICT` | Refresh the application; it may not be ready for claim submission |
| `422 INVALID_INVESTOR_IDENTITY` | Block submission and direct the investor to onboarding/support |
| Other `422` verification errors | Show the backend message, refresh state, and allow Retry |

Always log/display `requestId` in support diagnostics. Never convert RPC or synchronization errors
into `TRANSACTION_REQUIRED` on the client.

## Suggested UI copy

| State | Badge | Primary message/action |
|---|---|---|
| `notInitiated` | Not submitted | Submit claim |
| Wallet open | Awaiting signature | Confirm the transaction in your wallet |
| `PENDING_CONFIRMATION` | Confirming | Transaction submitted; waiting for confirmations |
| `SYNCING` | Synchronizing | Claim found on-chain; updating platform records |
| `TRANSACTION_REQUIRED` | Action required | Submit claim transaction |
| `CONFIRMED` | Confirmed | Claim submitted successfully |
| Temporary API/RPC error | Check unavailable | Check again |

Show a block-explorer link only when a real `txHash` exists. Never display or invent a placeholder
hash as transaction proof.

## Acceptance checklist

- Retry calls the backend before any wallet prompt.
- MetaMask opens only after `TRANSACTION_REQUIRED` and a fresh Prepare call.
- `SYNCING` and `PENDING_CONFIRMATION` never create another transaction.
- HTTP `202` is handled as success.
- The broadcast hash is posted immediately after the wallet returns it.
- Polling has one in-flight request, cleanup, backoff, and a finite automatic duration.
- Reload resumes from claim `status`, `syncStatus`, and `txHash` returned by the list API.
- Repeated Retry clicks do not create duplicate rows or wallet requests.
- All required claims reaching `CONFIRMED` refreshes the application to `claimSubmitted`.
- Error UI preserves the backend `message`, `error.code`, and `requestId` for support.

For backend behavior and response examples, see
[INVESTOR-CLAIM-SUBMISSION.md](./INVESTOR-CLAIM-SUBMISSION.md).
