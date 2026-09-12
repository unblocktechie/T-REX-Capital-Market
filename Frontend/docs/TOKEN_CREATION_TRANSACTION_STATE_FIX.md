# Token creation transaction-state fix

## What was wrong

The frontend treated the first successful deployment transaction as enough to continue finalization, even though token creation has mandatory follow-up blockchain steps.

The failure path was especially unsafe in two places:

1. `trexDeployment.service.js` caught a failed/reverted transfer-activation transaction and returned the deployment result anyway. That meant transaction #1 could make the overall promise look successful even when transaction #2 had failed.
2. `DeploymentProcessingPage.jsx` then called `POST /tokens/me/submit` using the deployment transaction hash and changed the local/backend-facing state to `deployed`. The price transaction was also allowed to fail without blocking finalization.

As a result, the UI could show a successful/finalized token while the live token contract was still paused or the configured price had not been confirmed.

## Safe state model

Mandatory steps are now treated independently:

- `deployment_pending` — deployment transaction submitted, receipt not confirmed yet
- `deployment_confirmed` — deployment receipt confirmed successfully
- `configuration_pending` — transfer activation transaction submitted or awaiting verification
- `configuration_failed` — transfer activation failed/reverted or the live state could not be verified
- `price_confirmation_required` — configured price is not yet confirmed on-chain
- `completed` — all mandatory transaction receipts are successful and the corresponding live contract state has been verified

The current backend may still use legacy values such as `deploymentPending` / `deployed`; the frontend accepts both while remaining fail-closed.

## Frontend changes

### Transaction #1 — deployment

- The deployment receipt must be successful before the deployed contract addresses are trusted.
- The confirmed deployment hash and addresses are saved as recovery information.
- A successful deployment does **not** imply that transfers are active or that creation is completed.

### Transaction #2 — transfer activation

- Failure is no longer swallowed.
- The transaction hash is retained when available.
- A retry first reads `paused()` from the token contract.
- If the token is already unpaused, no new transaction is sent.
- If a previous activation transaction is still pending, no duplicate is sent.
- If the previous activation transaction is confirmed reverted, a new activation retry is allowed.
- After a successful receipt, `paused()` is read again. The token is not considered configured unless the authoritative contract value is `false`.
- If the contract read is unavailable, the UI fails closed and never assumes the token is unpaused.

### Price confirmation

- The live platform-controller price is read before sending a price transaction.
- An existing pending price transaction is checked before any retry can send another one.
- A confirmed revert may be retried; a pending transaction cannot be duplicated.
- A successful receipt is followed by an authoritative on-chain price read.
- The creation flow cannot finalize until the live value matches the configured value.

### Finalization guard

`POST /tokens/me/submit` is now called only after the frontend has verified all mandatory on-chain state:

- deployment receipt confirmed;
- token contract address recovered from the confirmed deployment event;
- `paused() === false`;
- configured price confirmed on-chain when a price is required.

The success page also performs a fresh authoritative read. A transaction hash alone is no longer sufficient to display the success screen.

### Refresh and retry

Recovery metadata now stores the independent step state, token address, contract addresses, failed step, failed transaction hash, transfer-activation transaction hash, price transaction state, and authoritative pause state.

On refresh the flow uses the existing deployment transaction, reconstructs the deployed contracts, reads the live pause state and price, and resumes only the missing step. It does not redeploy the token.

The token details page also reads `paused()` directly from the contract before displaying whether transfers are active.

## Backend changes required

The supplied repository contains the frontend and API client only; server persistence/controller source is not present. The server should enforce the same rules so correctness does not depend on the browser.

For `POST /tokens/me/submit` (or the server-side finalization service), do **not** set `completed`, `isFinalized`, `currentStep=completed`, `isPaused=false`, a confirmed price, or equivalent fields from a submitted transaction hash alone.

Before finalizing, the backend should independently:

1. Load transaction #1 receipt and require a successful receipt (`status === 1` in RPC-style receipts; libraries such as viem expose the equivalent `status === 'success'`).
2. Resolve and validate the deployed token contract address from the confirmed receipt/event.
3. Read `paused()` from the token contract and persist the returned value rather than a hardcoded/optimistic value.
4. If activation transaction #2 is supplied, store its hash and receipt status independently. A reverted receipt must produce `configuration_failed` and must not alter the last confirmed pause state.
5. If a starting/current price is mandatory, read the platform-controller price and require it to match the configured value before completion.
6. Only then set `status=completed` and `isFinalized=true`.

Recommended server-side fields (names can match the existing schema):

- `deploymentTxHash`, `deploymentReceiptStatus`
- `configurationTxHash`, `configurationReceiptStatus`
- `priceTxHash`, `priceReceiptStatus`
- `failedStep`, `failedTxHash`, `lastTransactionError`
- `isPaused` (last authoritative contract read)
- `status`
- `isFinalized`
- `lastReconciledAt`

If a read or receipt check is temporarily unavailable, leave the record at its last confirmed state and return a pending/retryable response. Never infer success in a `finally` block.

## Acceptance test

Use a test token on Sepolia or a local fork and force the activation transaction to revert.

1. Submit deployment transaction #1 and allow it to confirm successfully.
2. Force transfer activation transaction #2 to revert.
3. Confirm transaction #1 remains recorded as successful.
4. Confirm transaction #2 is retained as failed/reverted with its hash when available.
5. Confirm the UI reads `paused()` and displays the exact live value.
6. Confirm `/tokens/me/submit` is not called by the frontend before mandatory configuration succeeds.
7. Confirm the token is not shown as completed/ready.
8. Refresh the page. Confirm it recovers from transaction #1 and remains on the incomplete setup state without redeploying.
9. Retry activation. While a transaction is pending, confirm the retry does not submit another transaction.
10. Allow activation to confirm, verify `paused() === false`, then confirm the required price transaction (if configured).
11. Only after every mandatory live check passes should finalization run and the success screen become available.

## Files changed for this fix

- `src/services/trexDeployment.service.js`
- `src/services/blockchain/trexPlatformController.service.js`
- `src/services/pendingDeployment.service.js`
- `src/pages/tokens/DeploymentProcessingPage.jsx`
- `src/pages/tokens/DeploymentSuccessPage.jsx`
- `src/pages/tokens/TokenDetailsPage.jsx`
- `src/components/token-issuance/DeploymentConfirmationModal.jsx`
- `src/hooks/useMyToken.js`
- `src/api/tokens/token.mapper.js`
- `src/api/tokens/token.api.js`
- `src/pages/tokens/ReviewDeployPage.jsx`
