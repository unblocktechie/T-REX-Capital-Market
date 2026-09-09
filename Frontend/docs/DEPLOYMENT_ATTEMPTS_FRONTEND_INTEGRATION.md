# Deployment Attempts Frontend Integration

The token deployment screen follows the backend-authorized, two-phase flow documented in `DEPLOYMENT-ATTEMPTS.md`.

## Runtime sequence

1. Check `GET /tokens/me/deployment-attempts/active` before opening MetaMask.
2. Validate the connected issuer wallet and required chain when a new transaction is allowed.
3. Create an idempotent attempt with `POST /tokens/me/deployment-attempts`.
4. Open MetaMask only when the backend returns `status: pending` and `canInitiateTransaction: true`.
5. Immediately after broadcast, call `PATCH /tokens/me/deployment-attempts/:deploymentAttemptUid/submitted` with the hash, chain, and wallet.
6. Call `POST /tokens/me/submit` with the attempt UID and transaction hash after broadcast/confirmation.
7. Poll the idempotent submit endpoint when it returns HTTP `202`. A `200` finalizes the local token state.
8. Close wallet rejection or another pre-broadcast failure through `PATCH .../:deploymentAttemptUid/fail`.

## Recovery behavior

- `submitted` and `confirming` attempts resume from the backend hash after refresh without reopening MetaMask.
- A reusable `pending` attempt continues only when the backend explicitly authorizes it.
- Local browser recovery is supplementary; the backend active-attempt response is authoritative.
- RPC outages and pending confirmations retry backend verification only and never send a duplicate deployment.
- Reverted or invalid transactions are handed to the backend finalization endpoint so the backend can mark the attempt and token failed.

## Status-aware routing

- `draft`: token creation flow
- `readyToDeploy`: Review & Deploy
- `deploymentPending`: deployment processing
- `deploymentFailed`: Review & Deploy retry
- `deployed`: token overview

The dashboard, sidebar, route guard, and token-overview route use the same status rules.
