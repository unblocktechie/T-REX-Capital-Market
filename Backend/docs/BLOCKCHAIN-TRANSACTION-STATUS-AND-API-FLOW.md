# Blockchain transaction status and API flow

## Purpose

This guide describes the current transaction architecture for:

- Invest / Buy
- Send / Transfer
- Redemption

The user wallet executes blockchain transactions from the frontend. The backend observes,
independently verifies, indexes, reconciles, and reports those transactions. A backend API call is
not a prerequisite for executing a valid transaction.

```text
Transaction execution
Frontend wallet -> Smart contract -> Blockchain

Fast synchronization
Frontend txHash -> Backend confirmation API -> Verification -> blockchainTransaction

Fallback synchronization
Blockchain events -> Backend indexer -> Verification -> blockchainTransaction
```

The `blockchainTransaction` table is the canonical on-chain history. Legacy `tokenPurchase`,
`tokenTransfer`, and `tokenRedemption` records remain for historical data and off-chain business
workflow. A matching legacy record can be synchronized after the canonical transaction is
confirmed, but it is not blockchain proof by itself.

## Status ownership

Do not mix canonical blockchain status with redemption business status.

| Status family | Stored in | Controlled by | Meaning |
| --- | --- | --- | --- |
| Blockchain transaction | `blockchainTransaction` | Receipt/event verification and indexer | What happened on-chain |
| Redemption workflow | `tokenRedemption` | Investor/issuer business APIs | Request, authorization, and issuer decision |
| Legacy purchase/transfer | `tokenPurchase`, `tokenTransfer` | Historical compatibility only | Old backend-orchestrated workflow |

## Canonical blockchain statuses

### `SUBMITTED`

The transaction has been observed but is not final enough to mark confirmed.

Possible conditions:

- transaction exists but has not been mined;
- receipt exists but has fewer than the configured confirmation count;
- RPC does not know the hash yet.

Frontend behavior:

- show `Pending blockchain confirmation`;
- store the hash locally until it appears in history;
- repeat the confirmation API safely, or poll transaction history;
- never send a second blockchain transaction only because this status is delayed.

If the RPC cannot find the hash yet, the API can return `SUBMITTED` with `transactionUid: null`.
That response is an observation acknowledgement, not a persisted or confirmed transaction. The
frontend should retry confirmation later while the indexer independently continues scanning.

### `CONFIRMED`

The backend verified all required on-chain evidence, including:

- expected chain;
- supported target contract or configured delegation manager;
- expected function and decoded arguments;
- expected initiating wallet;
- successful canonical receipt;
- exact token and USDT events/amounts where applicable;
- configured confirmation count.

Only this status should be displayed as a successful investment, transfer, or redemption.

### `FAILED`

The transaction was mined with a failed/reverted receipt. It is safe for the UI to explain the
failure and allow the user to start a new wallet transaction.

The same failed hash must not be reused as proof for a new transaction.

### `ORPHANED`

A previously indexed block is no longer part of the current canonical chain after a reorganization.
The indexer marks affected records `ORPHANED`, rewinds its checkpoint, and scans the replacement
blocks.

Frontend behavior:

- do not treat the transaction as completed;
- refresh history and on-chain balances;
- wait for reconciliation before asking the user to transact again.

## Common confirmation API

### Request

```http
POST /api/v1/investments/transactions/confirm
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "chainId": 11155111,
  "txHash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "tokenUid": "02647af2-e585-4c03-8984-108e1e44c616",
  "expectedAction": "INVEST"
}
```

`expectedAction` accepts:

- `INVEST`
- `TRANSFER`
- `REDEMPTION`

The frontend supplies only transaction identity and expected context. The backend does not trust
frontend-provided wallets, recipient, token amount, USDT amount, price, contract addresses, or
status. Those values are decoded from the transaction, receipt, events, contract state, and backend
token ownership context.

### Status response

The endpoint returns HTTP `200` for a valid observed transaction whose current canonical status is
`SUBMITTED`, `CONFIRMED`, or `FAILED`.

```json
{
  "success": true,
  "message": "Transaction submitted and awaiting blockchain confirmations.",
  "data": {
    "transactionUid": "7d02a540-c1d1-4e24-8f83-1018d85facf7",
    "chainId": 11155111,
    "tokenUid": "02647af2-e585-4c03-8984-108e1e44c616",
    "transactionHash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "type": "INVEST",
    "status": "SUBMITTED",
    "confirmationCount": 1,
    "requiredConfirmations": 2
  }
}
```

Definitive mismatches return a `4xx` response and are never recorded as successful. Temporary RPC
or infrastructure errors can return `503`; the on-chain transaction remains valid and the indexer
can recover it later.

## Transaction history APIs

### Paginated history

```http
GET /api/v1/investments/transactions
```

Supported query parameters:

```text
page
limit
tokenUid
type
status
walletAddress
txHash
fromDate
toDate
search
```

Example:

```http
GET /api/v1/investments/transactions?tokenUid=02647af2-e585-4c03-8984-108e1e44c616&type=INVEST&status=CONFIRMED&page=1&limit=20
```

Access scope:

- Investor: transactions belonging to the investor wallet.
- Issuer: transactions belonging to the issuer organization/tokens.
- Super Administrator: all authorized transaction history.

### CSV export

```http
GET /api/v1/investments/transactions/export
```

The export endpoint accepts the same filters and exports the complete filtered result rather than
only the current page.

## Invest / Buy call order

```text
1. Load token details
2. Read current controller quote and token configuration on-chain
3. Read USDT allowance on-chain
4. If allowance is insufficient, investor signs USDT approve()
5. Wait for the approval receipt and re-read allowance
6. Investor signs Platform Controller buy()
7. Save txHash locally in the frontend
8. POST /transactions/confirm with expectedAction = INVEST
9. If SUBMITTED, poll GET /transactions using txHash
10. When CONFIRMED, refresh history and balances
```

Backend calls:

```http
GET  /api/v1/investments/tokens/:tokenUid
POST /api/v1/investments/transactions/confirm
GET  /api/v1/investments/transactions?type=INVEST&tokenUid=:tokenUid
```

There is no required pending-purchase API before MetaMask. Do not call the removed orchestration
endpoints:

```text
POST /api/v1/investments/tokens/:tokenUid/purchases
POST /api/v1/investments/purchases/:purchaseUid/confirm
POST /api/v1/investments/purchases/:purchaseUid/retry
```

USDT approval is a separate wallet transaction. Current allowance must be read from the chain. The
current confirmation API does not accept `USDT_APPROVAL` as an `expectedAction`, so an approval hash
must not be submitted as an `INVEST` transaction.

## Send / Transfer call order

```text
1. Load the token and connected investor wallet
2. Validate recipient and amount for frontend UX
3. Optionally read recipient eligibility/compliance for early feedback
4. Investor signs token.transfer(recipient, amount) directly
5. Save txHash locally
6. POST /transactions/confirm with expectedAction = TRANSFER
7. If SUBMITTED, poll canonical transaction history
8. When CONFIRMED, refresh sender and recipient balances
```

Backend calls:

```http
GET  /api/v1/investments/tokens/:tokenUid
POST /api/v1/investments/transactions/confirm
GET  /api/v1/investments/transactions?type=TRANSFER&tokenUid=:tokenUid
```

Do not call the removed transfer orchestration endpoints:

```text
POST /api/v1/investments/tokens/:tokenUid/transfers
POST /api/v1/investments/transfers/:transferUid/confirm
POST /api/v1/investments/transfers/:transferUid/retry
```

The token and compliance contracts—not a backend pending record—are the execution authority.

## Redemption call order

Redemption has an off-chain business workflow before the investor submits the atomic on-chain
redemption. The business record and blockchain record therefore have separate statuses.

### Phase A: investor request and authorization

```http
POST /api/v1/investments/tokens/:tokenUid/redemptions
```

```json
{
  "tokenAmount": "10",
  "idempotencyKey": "redeem-unique-client-key"
}
```

Resulting business status:

```text
PENDING_INVESTOR_AUTHORIZATION
```

The investor signs the returned EIP-712 authorization data and sends the signature:

```http
POST /api/v1/investments/redemptions/:redemptionUid/authorize
```

```json
{
  "signature": "0x..."
}
```

Resulting business status:

```text
PENDING_ISSUER_APPROVAL
```

### Phase B: issuer decision

Issuer reads and approves or rejects the request:

```http
GET  /api/v1/investments/issuer/redemptions/:redemptionUid
POST /api/v1/investments/issuer/redemptions/:redemptionUid/approve
POST /api/v1/investments/issuer/redemptions/:redemptionUid/reject
```

Approval result:

```text
ISSUER_APPROVED
```

Rejection result:

```text
ISSUER_REJECTED
```

The issuer maintains sufficient USDT balance and allowance for the Platform Controller. The issuer
does not send a separate USDT payment for each approved redemption.

### Phase C: investor executes redemption

```text
1. Frontend verifies the business request is ISSUER_APPROVED
2. Frontend reads issuer USDT allowance/balance on-chain
3. Investor signs Platform Controller redeem(token, tokenAmountRaw)
4. Controller atomically burns tokens and transfers issuer USDT to investor
5. Frontend saves txHash locally
6. POST /transactions/confirm with expectedAction = REDEMPTION
7. Backend verifies receipt, burn, USDT settlement, quote, wallets, and confirmations
8. Canonical status becomes CONFIRMED
9. Matching redemption business record becomes COMPLETED
10. Refresh redemption detail and canonical history
```

Backend synchronization calls:

```http
POST /api/v1/investments/transactions/confirm
GET  /api/v1/investments/transactions?type=REDEMPTION&tokenUid=:tokenUid
GET  /api/v1/investments/redemptions/:redemptionUid
```

Do not call the removed backend settlement endpoints:

```text
POST /api/v1/investments/redemptions/:redemptionUid/retry
POST /api/v1/investments/issuer/redemptions/:redemptionUid/payment/confirm
```

## Active redemption business statuses

| Status | Controlled by | Frontend action |
| --- | --- | --- |
| `PENDING_INVESTOR_AUTHORIZATION` | Investor workflow | Sign and submit the EIP-712 authorization, or cancel |
| `PENDING_ISSUER_APPROVAL` | Issuer workflow | Issuer approves/rejects; investor may cancel |
| `ISSUER_APPROVED` | Issuer workflow | Investor may execute `redeem()`; cancellation remains allowed before submission |
| `ISSUER_REJECTED` | Issuer workflow | Terminal; display rejection reason |
| `CANCELLED` | Investor workflow | Terminal |
| `EXPIRED` | Background/business expiry | Terminal; create a new request if eligible |
| `COMPLETED` | Verified blockchain synchronization | Terminal successful redemption |
| `MANUAL_REVIEW` | Recovery/operations | Do not transact again until reviewed |

The following values belong to the previous backend-executed lock/payment/burn/unlock state machine
and may exist on historical rows, but the new frontend flow must not wait for or generate them:

```text
TOKEN_LOCK_SUBMITTED
TOKENS_LOCKED
PAYMENT_SUBMITTED
PAYMENT_CONFIRMED
BURN_SUBMITTED
BURN_CONFIRMED
UNLOCK_SUBMITTED
CANCELLATION_PENDING
```

## Role of the indexer

The confirmation API is the fast path. The indexer is the independent recovery path.

The indexer exists for these scenarios:

- frontend closes after the wallet returns a hash;
- frontend loses internet access;
- confirmation API times out or returns `503`;
- backend is offline while the blockchain transaction succeeds;
- transaction is submitted through another supported client;
- the application restarts after partially scanning a range;
- a chain reorganization replaces previously scanned blocks.

### Indexer process

```text
Load global checkpoint
        ↓
Acquire database lease
        ↓
Read latest block
        ↓
Calculate safe block using configured confirmations
        ↓
Scan unprocessed block ranges
        ↓
Read supported token and USDT Transfer events
        ↓
Identify INVEST / TRANSFER / REDEMPTION candidates
        ↓
Run the same verifier used by POST /transactions/confirm
        ↓
Idempotently upsert blockchainTransaction
        ↓
Synchronize a matching legacy/business record when applicable
        ↓
Advance checkpoint only after the complete range succeeds
```

### Indexer guarantees

- Global chain progress is stored using a persisted checkpoint.
- Only blocks meeting the configured confirmation threshold are scanned as safe.
- Multiple deployed token contracts are scanned in address batches.
- Newly deployed token contracts receive a one-time historical backfill so their earlier events are
  not missed after the global checkpoint has advanced.
- `chainId + transactionHash + logIndex` protects event-level idempotency.
- Reprocessing a block does not create duplicate history records.
- A database/RPC failure prevents checkpoint advancement for that range.
- A checkpoint block-hash mismatch marks affected records `ORPHANED`, rewinds, and rescans.
- A database lease prevents multiple backend instances from advancing the same indexer concurrently.

The default interval is 15 seconds and the current confirmation default is 2 blocks. Both values
are configurable. Frontend code must not assume the indexer will always complete in exactly 15
seconds because RPC latency, block production, confirmation waiting, backfill, and backlog can add
time.

## Confirmation and polling rules

| API/result | Frontend behavior |
| --- | --- |
| Confirm returns `CONFIRMED` | Show success and refresh history/balance |
| Confirm returns `SUBMITTED` | Show pending; poll history; do not reopen MetaMask |
| Confirm returns `FAILED` | Show blockchain failure; allow a new transaction |
| Confirm returns definitive `4xx` mismatch | Show invalid/unrelated transaction; do not mark success |
| Confirm returns `503` or times out | Preserve txHash; show synchronization pending; retry API/history later |
| History contains `ORPHANED` | Remove success state and wait for reconciliation |
| Hash is absent from history | Keep local hash and retry confirmation; indexer may discover it later |

Recommended polling:

```text
Immediately after hash: call confirmation API
While SUBMITTED: refresh history after 3s, 5s, 10s, then every 15s
On window focus/reconnect: refresh history once
After CONFIRMED or FAILED: stop polling that hash
```

## Idempotency rules

- The same transaction hash may be sent to the confirmation API multiple times.
- Repeated confirmation calls must never create another blockchain transaction.
- Indexer processing and API processing may happen concurrently; database unique keys prevent
  duplicate canonical records.
- UI rows should be deduplicated by `chainId + transactionHash + type`.
- The frontend must not change an `expectedAction` to force an unrelated transaction to validate.
- Never infer success from MetaMask alone. Success means the backend returns or indexes
  `CONFIRMED` after independent on-chain verification.

## End-to-end summary

```text
User initiates action
        ↓
Frontend performs required on-chain reads
        ↓
User signs Invest / Transfer / Redeem
        ↓
Frontend stores txHash locally
        ↓
Frontend calls POST /transactions/confirm
        ├── CONFIRMED -> show success
        ├── FAILED    -> show failure
        └── SUBMITTED -> show pending and poll history

Independently and continuously:

Blockchain -> Indexer -> Shared verifier -> Canonical history
                         ↓
                 Legacy/business synchronization
```

The core invariant is:

```text
Frontend wallet submission is an attempt.
Canonical blockchain verification is the proof.
The indexer guarantees recovery when the fast API path is missed.
```
