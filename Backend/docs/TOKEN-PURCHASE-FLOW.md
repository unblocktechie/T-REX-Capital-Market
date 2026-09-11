# Token Purchase and Settlement (legacy)

> Deprecated on 2026-09-11. This document describes retained production-data tables only. New
> purchases are executed with `PlatformController.buy()` by the investor wallet, confirmed through
> `/api/v1/investments/transactions/confirm`, and recovered by the canonical indexer. Do not call
> the purchase create/confirm/retry endpoints. See `FRONTEND-BLOCKCHAIN-TRANSACTION-GUIDE.md`.

This flow lets a registered investor pay in configured Sepolia USDT and receive the deployed
ERC-3643 token. The backend is authoritative for amounts, payment verification, and mint
confirmation. The browser never sends trusted wallet, contract, recipient, price, or raw amount
values.

## Settlement invariant

1. USDT moves from `investorMaster.walletAddress` to `tokenMaster.treasuryWalletAddress`.
2. The backend independently proves the exact ERC-20 `transfer` transaction and event.
3. The configured platform signer (`DEPLOYER_PRIVATE_KEY`) must be a Token Agent.
4. The worker re-verifies the canonical USDT payment immediately before minting, then the platform
   signer calls `token.mint(investorWalletAddress, tokenAmountRaw)`.
5. A purchase becomes `COMPLETED` only after the backend verifies the mint calldata, successful
   receipt, zero-address `Transfer` event, confirmations, and final investor balance.

Tokens are minted to the **investor wallet**, not the issuer wallet. The issuer receives USDT in
the configured treasury wallet.

## Configuration

```env
PURCHASE_USDT_ADDRESS=0x8fC7e68897bd74c4B6340d2DC857a7ED2677aF6A
PURCHASE_PAYMENT_CONFIRMATIONS=2
PURCHASE_CONFIRMATIONS=2
PURCHASE_INTENT_TTL_MINUTES=15
PURCHASE_INDEXER_START_BLOCK=0
PURCHASE_WORKER_ENABLED=true
```

The USDT address is network-specific and configurable. The backend reads `decimals()` from that
contract rather than assuming six decimals. `DEPLOYER_PRIVATE_KEY`, `DEPLOYER_ADDRESS`,
`SEPOLIA_RPC_URL`, and `BLOCKCHAIN_CHAIN_ID` use the existing blockchain configuration.

## APIs

All APIs require the Investor JWT and database RBAC permission.

### 1. Create payment intent

`POST /api/v1/investments/tokens/:tokenUid/purchases`

```json
{
  "tokenAmount": "10.25",
  "idempotencyKey": "checkout-20260910-0001"
}
```

Prerequisites: the interest is `registered`, token is deployed, investor is active, all stored
addresses are valid, platform wallet is a Token Agent, and the requested amount does not exceed
`maxBalancePerInvestor`. Only one unsettled purchase per investor is allowed, preventing a missing
hash from ambiguously matching two identical USDT transfers.

The backend snapshots `currentTokenPrice` when the purchase intent is created and calculates raw amounts exactly. USDT is rounded **up** to
the smallest USDT base unit so the treasury is never underpaid. Response example:

```json
{
  "purchaseUid": "...",
  "status": "PENDING_PAYMENT",
  "chainId": 11155111,
  "usdtContractAddress": "0x8fC7...aF6A",
  "treasuryWalletAddress": "0x...",
  "investorWalletAddress": "0x...",
  "tokenAddress": "0x...",
  "tokenAmount": "10.25",
  "tokenAmountRaw": "10250000000000000000",
  "usdtAmount": "15.375",
  "usdtAmountRaw": "15375000",
  "usdtDecimals": 6,
  "expiration": {
    "expiresAt": "2026-08-20T10:15:00.000Z",
    "expiredAt": null,
    "reason": null
  }
}
```

The frontend must use these returned values to call the configured USDT contract:

```solidity
transfer(treasuryWalletAddress, usdtAmountRaw)
```

Do not calculate the payment amount again in JavaScript floating-point arithmetic.

The frontend must submit the MetaMask payment before `expiration.expiresAt`. If the user closes
MetaMask and no hash is ever submitted, the background runner changes the row to `EXPIRED` after
the configured lifetime and indexer grace period. The frontend must then create a new intent with a
new idempotency key; an expired intent cannot be confirmed or retried.

### 2. Submit payment hash

`POST /api/v1/investments/purchases/:purchaseUid/confirm`

```json
{ "txHash": "0x...64 hex characters..." }
```

For a direct EOA transaction, the backend verifies the USDT transaction recipient and decodes the
`transfer` selector and arguments. MetaMask may instead wrap the call through its delegated-wallet
execution contract; in that case the outer `tx.to` and calldata are not treated as the USDT call.
Both execution types must still have the expected investor as `tx.from`, zero native value, a
successful canonical receipt, `PURCHASE_PAYMENT_CONFIRMATIONS`, and an exact `Transfer` event
emitted by the configured USDT contract with the database investor, treasury, and raw amount.
Transaction-hash uniqueness is also enforced. Exact expected values come only from the pending
database row. An
unmined or under-confirmed transaction returns HTTP `200` with the current `PENDING_PAYMENT` state
and remains recoverable. A definitive
mismatch returns `422` and never confirms payment.

After payment verification, this same request atomically claims the purchase, acquires the global
platform-mint lease, calls `mint(investorWalletAddress, tokenAmountRaw)`, and persists the mint hash
immediately. It then waits for `PURCHASE_CONFIRMATIONS`, independently verifies the mint transaction,
calldata, successful receipt, zero-address `Transfer` event and final balance, persists block/hash/
transaction-index/log-index/gas metadata, and normally returns `COMPLETED` in the same response.
For Sepolia this project uses one confirmation. If mining exceeds the configured HTTP wait timeout,
another process owns the mint lease, or a transient RPC failure occurs, the API returns HTTP `200`
with the current `MINT_SUBMITTED` or other persisted state; the worker verifies the same stored hash
later without minting twice. Confirm also returns HTTP `200` with `EXPIRED` when the intent already
expired. The frontend must always branch on `data.status`.

Waiting for required confirmations is normal progress, not a failure. While the submitted payment
or mint is below its applicable threshold, the row remains queued with `error: null`; the transaction
history uses `PENDING`. `syncStatus: FAILED` and error fields are reserved for actual RPC,
verification, receipt, event, or broadcast failures.

### 3. List token purchase history

`GET /api/v1/investments/tokens/:tokenUid/purchases?page=1&limit=20&search=&status=all` returns the
authenticated investor's purchase rows for that token, newest first. It includes lifecycle, amount,
expiration, payment, mint, and synchronization data plus pagination metadata. `status` accepts all
five lifecycle statuses or `all`; `search` matches purchase/idempotency identifiers, transaction
hashes, relevant addresses, and token/USDT amounts.

### 4. Get or poll one purchase

`GET /api/v1/investments/purchases/:purchaseUid`

Status progression:

```text
PENDING_PAYMENT -> PAYMENT_CONFIRMED -> MINT_SUBMITTED -> COMPLETED
       |
       +-- no payment hash before deadline --> EXPIRED
```

The successful confirm request normally traverses these states internally and returns `COMPLETED`.
Polling is required when the returned status is not terminal (`COMPLETED` or `EXPIRED`).

The response contains full payment and mint block/hash/log/gas timestamps plus append-only
`transactionHistory` containing received, submitted, pending, confirmed, and failed attempts.

### 5. Retry synchronization

`POST /api/v1/investments/purchases/:purchaseUid/retry` with `{}` queues recovery and returns
HTTP `202`. It never asks the backend to fabricate a hash or mint twice. `COMPLETED` is idempotent.
An `EXPIRED` intent returns `409 PURCHASE_EXPIRED`; create a fresh purchase instead.

## Recovery architecture

- A global `tokenPurchasePayment` checkpoint scans the configured USDT contract once, stores
  durable `Transfer` events, then matches exact pending intents. This recovers payment when the
  frontend crashes before sending its hash.
- After event matching, the same leased worker expires only `PENDING_PAYMENT` rows whose deadline
  plus `PurchaseIntentExpiryGraceSeconds` has passed and whose `paymentTxHash` is still null. It
  performs expiration only when the global payment indexer has reached the safe chain head. After
  backend downtime, historical transfers are therefore indexed and matched before overdue intents
  are expired. A stored-but-not-yet-processed matching payment event also prevents expiration.
  Rows with a payment hash are never auto-expired.
- Payment rows with a known hash are verified directly without a historical scan.
- The worker stores `mintPreparedAtBlock` before broadcast and `mintTxHash` immediately after.
- API and worker mint broadcasts share the database-backed `platformTokenAgentExecution` lease with
  redemption lock/burn/unlock broadcasts, and the
  purchase row can be atomically claimed only once. Concurrent confirm/retry calls cannot submit a
  duplicate mint.
- If the process crashes after broadcast but before hash persistence, targeted recovery searches
  only the relevant token's zero-address `Transfer` events from `mintPreparedAtBlock`, then
  verifies the recovered transaction normally.
- A database checkpoint lease ensures only one worker instance submits platform-wallet mints at a
  time, avoiding cross-instance nonce races and duplicate mint transactions.
- Failed/reverted hashes remain in `tokenPurchaseTransaction`; a controlled Retry can submit a new
  mint only after deterministic failure.

## Database

- `tokenPurchase`: authoritative intent and current payment/mint state.
- `tokenPurchaseTransaction`: append-only transaction-attempt audit history.
- `tokenPurchasePaymentEvent`: durable USDT event ledger for missing-hash reconciliation.
- `blockchainIndexerCheckpoint`: global checkpoint and distributed lease using indexer name
  `tokenPurchasePayment`.

Migrations: `database/migrations/20260910_add_token_purchase_flow.sql` and, for an existing
installation, `database/migrations/20260910_expire_abandoned_token_purchases.sql` and
`database/migrations/20260910_add_investor_token_purchase_history.sql`.

Frontend implementation: `docs/FRONTEND-TOKEN-PURCHASE-FLOW-GUIDE.md`.
