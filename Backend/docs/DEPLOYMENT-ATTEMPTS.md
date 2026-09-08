# Token Deployment Attempts

Two-phase, idempotent T-REX deployment flow. A dedicated `tokenDeploymentAttempt`
record tracks each browser-initiated deployment so the backend controls when a wallet
transaction may start, records the broadcast hash, independently verifies the on-chain
result, and can resume after a refresh. The permanent `tokenMaster` status is kept
separate from an individual attempt and only becomes `deployed` after verification.

All endpoints live under the existing authenticated token router and reuse the existing
JWT authentication + DB-driven RBAC (`permissionMaster`). They are Issuer-only.

## Token status during deployment

| Phase                    | `tokenMaster.status`  | Attempt `status`         |
|--------------------------|-----------------------|--------------------------|
| Configuring              | `draft`               | —                        |
| Attempt created          | `deploymentPending`   | `pending`                |
| Transaction broadcast    | `deploymentPending`   | `submitted`              |
| Awaiting confirmation    | `deploymentPending`   | `confirming`             |
| Verified & finalized     | `deployed`            | `confirmed`              |
| Wallet rejected / expired| `draft` (released)    | `wallet_rejected` / `cancelled` / `expired` |
| On-chain revert / bad tx | `deploymentFailed`    | `failed`                 |

`draft` is restored on pre-broadcast failure so the issuer can retry. A `deploymentPending`
token is still fully readable via `GET /api/v1/tokens/me` and `GET .../deployment-attempts/active`,
so a refresh never locks the issuer out.

## Frontend sequence

1. `POST /api/v1/tokens/me/deployment-attempts` with a client-generated `idempotencyKey`.
2. Only open MetaMask when the response is successful, `status` is `pending`, and
   `canInitiateTransaction` is `true`.
3. Broadcast the T-REX deployment transaction from the connected wallet.
4. `PATCH .../deployment-attempts/:deploymentAttemptUid/submitted` with the `transactionHash`.
5. Wait for the receipt.
6. `POST /api/v1/tokens/me/submit` with `{ deploymentAttemptUid, transactionHash }`.
   A `202` means keep polling; a `200` means finalized.
7. If the user rejects MetaMask *before* broadcasting, `PATCH .../fail` with `wallet_rejected`.
8. On refresh, `GET .../deployment-attempts/active` and resume from the reported state.

## Endpoints

### POST `/api/v1/tokens/me/deployment-attempts`
Create (or idempotently return) a pending deployment attempt.

Auth: Bearer (Issuer). Request:
```json
{ "chainId": 11155111, "walletAddress": "0x...", "idempotencyKey": "unique-client-value" }
```
Optional: `networkName` (string), `metadata` (object, non-critical).

`201` when created, `200` when an existing compatible attempt is returned:
```json
{
  "success": true,
  "message": "Deployment attempt created successfully.",
  "data": {
    "deploymentAttemptUid": "uuid",
    "tokenUid": "uuid",
    "status": "pending",
    "chainId": 11155111,
    "walletAddress": "0x... (checksummed)",
    "expiresAt": "2026-08-04T07:30:00.000Z",
    "canInitiateTransaction": true
  }
}
```
Errors: `403 INVALID_DEPLOYER_WALLET`, `400 UNSUPPORTED_CHAIN`, `409 TOKEN_ALREADY_DEPLOYED`,
`409 DEPLOYMENT_ALREADY_IN_PROGRESS`, `409 DEPLOYMENT_ATTEMPT_EXPIRED`,
`422 TOKEN_NOT_READY_FOR_DEPLOYMENT`.

Idempotency: same `idempotencyKey` returns the same attempt; a live pending attempt owned
by the same user + wallet is returned rather than duplicated; a submitted transaction blocks
a new attempt with `409`.

### PATCH `/api/v1/tokens/me/deployment-attempts/:deploymentAttemptUid/submitted`
Record the broadcast transaction hash. Does **not** mark the token deployed.

Request:
```json
{ "transactionHash": "0x...", "chainId": 11155111, "walletAddress": "0x..." }
```
`200`:
```json
{ "success": true, "message": "Deployment transaction recorded.",
  "data": { "deploymentAttemptUid": "uuid", "status": "submitted", "transactionHash": "0x..." } }
```
Idempotent for the same hash; a different hash → `409 TRANSACTION_HASH_CONFLICT`.
Errors: `409 DEPLOYMENT_ATTEMPT_EXPIRED`, `409 DEPLOYMENT_ATTEMPT_NOT_ACTIVE`,
`403 INVALID_DEPLOYER_WALLET`, `400 UNSUPPORTED_CHAIN`.

### PATCH `/api/v1/tokens/me/deployment-attempts/:deploymentAttemptUid/fail`
Close a pending attempt after a wallet rejection or pre-broadcast failure.

Request (`status` limited to `wallet_rejected` | `cancelled` | `failed`):
```json
{ "status": "wallet_rejected", "errorCode": "USER_REJECTED_REQUEST", "errorMessage": "The wallet request was rejected." }
```
Idempotent. An attempt that already carries a transaction hash cannot be closed here
(`409 TRANSACTION_ALREADY_BROADCAST`) — a broadcast transaction must be verified.
The frontend cannot set `confirmed`, `contractAddress`, or `blockNumber` (rejected by validation).

**Reconcile-before-revert (crash-recovery safety).** If the token is in `deploymentPending`,
the backend does **not** blindly revert it to `draft` when a fail arrives — because the frontend
may have broadcast (and even confirmed) the deployment while the backend was down, so the
transaction hash was never recorded. Before closing, the backend independently checks the chain
by deterministic salt: it derives `toHexString(owner) + tokenName` (the exact salt the TREX
Gateway builds), calls `factory.getToken(salt)`, and:

- **Token exists on-chain** → finalize it as `deployed` (recovering the tx hash + suite
  addresses via the `TREXSuiteDeployed` event) and **reject the fail** with
  `409 TOKEN_ALREADY_DEPLOYED`. The token is never lost.
- **Nothing on-chain** → safe: close the attempt and revert the token to `draft` for retry.
- **Chain unreachable / cannot verify** → conservative: close the attempt but keep the token in
  `deploymentPending` (never `draft`), so it can't be edited or re-deployed; the background sync
  reconciles it later.

This requires the owner to be the approved organization wallet and the token name to match what
was deployed. Configure the lookup start block with `TREX_FACTORY_START_BLOCK` (the factory
deploy block) to avoid scanning Sepolia from genesis.

### GET `/api/v1/tokens/me/deployment-attempts/active`
Resume state after a refresh.
```json
{
  "success": true,
  "data": {
    "tokenUid": "uuid",
    "tokenStatus": "deploymentPending",
    "tokenDeployed": false,
    "deployTransactionHash": null,
    "canCreateNew": false,
    "attempt": {
      "deploymentAttemptUid": "uuid", "status": "submitted", "transactionHash": "0x...",
      "chainId": 11155111, "walletAddress": "0x...", "expiresAt": null,
      "submittedAt": "...", "canInitiateTransaction": false
    }
  }
}
```
Only the authenticated user's own token/attempts are returned.

### POST `/api/v1/tokens/me/submit` (extended, backward compatible)
Finalizes the token after **independent** blockchain verification.

Request (new):
```json
{ "deploymentAttemptUid": "uuid", "transactionHash": "0x..." }
```
Legacy request still accepted:
```json
{ "transactionHash": "0x..." }
```
When `deploymentAttemptUid` is omitted the backend auto-links an existing attempt by
`(tokenUid, transactionHash)` and never creates a duplicate.

Responses:
- `200` finalized — token `deployed`, attempt `confirmed`.
- `202` still confirming (keep polling):
  ```json
  { "success": false, "pending": true, "message": "Deployment transaction is still awaiting confirmation.",
    "data": { "deploymentAttemptUid": "uuid", "status": "confirming", "transactionHash": "0x..." } }
  ```
- `422 TOKEN_DEPLOYMENT_VERIFICATION_FAILED` — mined but reverted / no `TREXSuiteDeployed` event.
- `409 TRANSACTION_HASH_CONFLICT` / `CONTRACT_ADDRESS_CONFLICT` — hash/address already used by another token.
- `403 INVALID_DEPLOYER_WALLET` — transaction sender ≠ authorized deployment wallet.
- `503 RPC_UNAVAILABLE` — provider temporarily unreachable (transaction is **not** marked failed).

Idempotent: calling it again for an already-deployed token with the same hash returns `200`
without re-verifying or redeploying.

## Independent blockchain verification

Verification uses the configured Sepolia RPC (`SEPOLIA_RPC_URL`, chain `11155111`) and the
existing `TokenDeploymentReceiptService`. The backend never trusts frontend-supplied
success, contract address, block number, sender, chain, confirmation count, or event data.
It confirms: the receipt exists with the required confirmations, `status === 1`, the
`TREXSuiteDeployed` event was emitted by the configured `TREX_FACTORY_ADDRESS`, every suite
address is a valid non-zero address, the block timestamp resolves, the sender matches the
attempt wallet, and neither the contract address nor the transaction hash already belongs to
another token. RPC URLs and keys come only from environment configuration.

## Configuration

```
BLOCKCHAIN_CHAIN_ID=11155111
SUPPORTED_CHAIN_IDS=11155111
BLOCKCHAIN_NETWORK_NAME=sepolia
DEPLOYMENT_ATTEMPT_TTL_MINUTES=20
```

## Expiration

Pending attempts past `expiresAt` are marked `expired` opportunistically at the start of the
create / submitted / active calls. `submitted` and `confirming` attempts are **never** expired,
because a broadcast transaction may still confirm. A background job is optional and not required
for the flow to work.

## Migration

`database/migrations/20260804_add_token_deployment_attempts.sql` creates the
`tokenDeploymentAttempt` table and indexes, adds the `deploymentPending` value to the
`tokenMaster.status` enum, and seeds the four Issuer `permissionMaster` rows. It is idempotent,
never modifies existing deployed-token records, and includes a commented rollback block.
Apply it after the base schema:

```bash
mysql -u root trexLaunchpad < database/migrations/20260804_add_token_deployment_attempts.sql
```
