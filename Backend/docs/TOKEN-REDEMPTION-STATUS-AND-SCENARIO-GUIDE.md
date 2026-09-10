# Token Redemption Status and Scenario Guide

## Purpose

This document defines the complete redemption lifecycle and explains which statuses are driven by the investor, the issuer, the blockchain/backend, or operations.

The main `status` is the business lifecycle status. It must be read together with the independent `lock.status`, `payment.status`, `burn.status`, `unlock.status`, `synchronization.status`, and `error` fields when diagnosing blockchain progress.

An HTTP `200` response means the API request was handled successfully. It does **not** mean the redemption is complete. The frontend must always use `data.status` as the source of truth.

## Responsibility groups

| Group | Meaning |
|---|---|
| Investor | The investor must sign, wait, or may cancel where permitted. |
| Issuer | The issuer must approve/reject or manually send the exact USDT payment. |
| Blockchain/backend | The backend submits or verifies an on-chain transaction and the worker safely reconciles it. |
| Terminal | The request is finished and normal processing stops. |
| Operations | Automatic processing stopped because proceeding without human review could be unsafe. |

Some statuses intentionally have two responsibilities. For example, `TOKENS_LOCKED` was produced by blockchain verification, but the next required actor is the issuer.

## Complete happy-path flow

```text
Investor creates redemption
        |
        v
PENDING_INVESTOR_AUTHORIZATION          Investor action
        |
        | investor signs EIP-712 authorization
        v
PENDING_ISSUER_APPROVAL                  Issuer action
        |
        | issuer approves
        v
ISSUER_APPROVED                          Backend handoff
        |
        | platform submits freezePartialTokens(...)
        v
TOKEN_LOCK_SUBMITTED                     Blockchain processing
        |
        | lock transaction is canonically confirmed
        v
TOKENS_LOCKED                            Issuer action
        |
        | issuer sends exact USDT and supplies txHash
        v
PAYMENT_SUBMITTED                        Blockchain verification
        |
        | USDT transaction is canonically verified
        v
PAYMENT_CONFIRMED                        Backend handoff
        |
        | platform submits burn(...)
        v
BURN_SUBMITTED                           Blockchain processing
        |
        | burn transaction is canonically confirmed
        +-------------------------------+
        |                               |
        | no lock cleanup required      | remaining redemption lock exists
        v                               v
COMPLETED                         BURN_CONFIRMED
                                        |
                                        | platform submits unfreezePartialTokens(...)
                                        v
                                  UNLOCK_SUBMITTED
                                        |
                                        | unlock transaction is canonically confirmed
                                        v
                                  COMPLETED
```

The configured confirmation requirement is currently 12 blocks by default. Until the requirement is met, the applicable submitted status remains unchanged and the background worker checks it again.

## Main status reference

| Status | Category | What it means | Waiting on / next action | Blockchain-related | Terminal |
|---|---|---|---|---:|---:|
| `PENDING_INVESTOR_AUTHORIZATION` | Investor | The backend created the intent and generated authoritative EIP-712 typed data. No valid wallet signature is stored yet. | Investor signs with the registered investor wallet and calls Authorize. | No transaction; cryptographic signature only. | No |
| `PENDING_ISSUER_APPROVAL` | Issuer | The backend verified and stored the investor signature. | Issuer reviews and approves or rejects. | No transaction. | No |
| `ISSUER_APPROVED` | Issuer + backend | The issuer approved the business request. Token locking is queued or being prepared. | Backend/platform Token Agent submits the lock. | Preparation stage; a hash may not exist yet. | No |
| `TOKEN_LOCK_SUBMITTED` | Blockchain/backend | The platform submitted `freezePartialTokens(investor, amount)`. | Wait for receipt, expected event, final frozen balance, canonical block, and confirmations. | Yes: platform lock transaction. | No |
| `TOKENS_LOCKED` | Blockchain result + issuer | The exact token amount is safely locked and cannot be spent during settlement. | Issuer sends the exact stored USDT amount from the authoritative issuer payment wallet to the investor wallet. | Lock is confirmed; no payment is confirmed yet. | No |
| `PAYMENT_SUBMITTED` | Issuer + blockchain/backend | A USDT hash was received or recovered and is being independently verified. | Backend verifies sender, recipient, USDT contract, amount, calldata, receipt, event, canonical block, and confirmations. | Yes: issuer USDT transaction. | No |
| `PAYMENT_CONFIRMED` | Blockchain/backend | The exact issuer USDT payment is independently verified. Burn is queued or being prepared. | Platform Token Agent submits the burn. Issuer must not pay again. | Payment confirmed; burn may not have a hash yet. | No |
| `BURN_SUBMITTED` | Blockchain/backend | The platform submitted `burn(investor, tokenAmount)`. | Wait for receipt, event, state validation, canonical block, and confirmations. | Yes: platform burn transaction. | No |
| `BURN_CONFIRMED` | Blockchain/backend | Burn succeeded, but a redemption-created frozen balance remains and must be cleaned up. | Platform submits the exact unlock transaction. | Yes: burn confirmed; unlock queued. | No |
| `UNLOCK_SUBMITTED` | Blockchain/backend | The platform submitted `unfreezePartialTokens(...)`. This can be post-burn cleanup or cancellation cleanup. | Wait for canonical unlock confirmation. Then go to `COMPLETED` after payment/burn, or `CANCELLED` for cancellation. | Yes: platform unlock transaction. | No |
| `CANCELLATION_PENDING` | Investor + blockchain/backend | The investor requested cancellation after approval or possible locking. The request cannot close until the backend proves no lock exists or releases the confirmed lock. | Worker reconciles the lock and submits/verifies unlock if required. | Possibly: lock recovery and/or unlock transaction. | No |
| `COMPLETED` | Successful terminal | Issuer payment, token burn, and any required lock cleanup are all confirmed. | No further action. | Final blockchain-backed success. | Yes |
| `ISSUER_REJECTED` | Issuer terminal | Issuer rejected the request before token locking. The rejection reason is retained. | Investor may review the reason and create a new request if otherwise eligible. | No transaction. | Yes |
| `CANCELLED` | Investor/system terminal | Cancellation finished. Either no token lock existed or the confirmed lock was released first. | No further action. | May include a confirmed unlock transaction. | Yes |
| `EXPIRED` | Investor inactivity terminal | The investor did not provide a wallet authorization before `expiresAt`. | Create a new redemption intent. | No transaction. | Yes |
| `MANUAL_REVIEW` | Operations blocked state | A definitive mismatch or unsafe failure prevents automatic continuation. | Support/operations investigates DB history and on-chain evidence. | Usually related to on-chain validation or platform execution. | Yes for automatic API/worker processing |

`MANUAL_REVIEW` is deliberately treated as terminal by the Retry API and excluded from automatic recovery candidates. It also remains an active redemption for the investment, so a new redemption is blocked until operations resolves the case safely.

## Secondary status fields

The main status tells the business story. These fields tell the detailed technical story.

### Lock, burn, and unlock status

| Value | Meaning |
|---|---|
| `NOT_STARTED` | The stage has not started. |
| `QUEUED` | The backend intends to execute the stage. |
| `PROCESSING` | A worker/API instance owns the execution lease and is preparing/submitting it. |
| `SUBMITTED` | A real blockchain transaction hash is stored. |
| `CONFIRMED` | The backend verified the transaction, expected event, final state, canonical block, and required confirmations. |
| `FAILED` | The latest stage attempt failed; inspect `error`. A retry may still be queued depending on error type. |
| `NOT_REQUIRED` | The stage is intentionally skipped for this path. |

### Payment status

| Value | Meaning |
|---|---|
| `NOT_STARTED` | Tokens are not ready for issuer settlement. |
| `AWAITING_ISSUER` | Tokens are locked; issuer must send USDT. |
| `SUBMITTED` | Payment hash was received/recovered and is being verified. |
| `CONFIRMED` | Exact issuer payment is independently verified on-chain. |
| `FAILED` | Payment verification failed; use the main status and `error` to decide the next step. |
| `NOT_REQUIRED` | Payment is not required because the redemption is being cancelled/rejected. |

### Synchronization status

| Value | Meaning |
|---|---|
| `IDLE` | No background work is currently required. |
| `QUEUED` | Reconciliation is scheduled at `nextSyncAt`. |
| `PROCESSING` | A worker is currently reconciling the record. |
| `FAILED` | Reconciliation stopped for the recorded error; if the main status is `MANUAL_REVIEW`, operations must intervene. |

### Transaction-history status

The append-only `transactionHistory` can contain `RECEIVED`, `SUBMITTED`, `PENDING`, `CONFIRMED`, or `FAILED`. These describe an individual hash, not the overall redemption.

## Scenario guide

### 1. Standard successful redemption

```text
PENDING_INVESTOR_AUTHORIZATION
-> PENDING_ISSUER_APPROVAL
-> ISSUER_APPROVED
-> TOKEN_LOCK_SUBMITTED
-> TOKENS_LOCKED
-> PAYMENT_SUBMITTED
-> PAYMENT_CONFIRMED
-> BURN_SUBMITTED
-> COMPLETED
```

If burn leaves a redemption-created frozen balance, the final part becomes:

```text
BURN_SUBMITTED
-> BURN_CONFIRMED
-> UNLOCK_SUBMITTED
-> COMPLETED
```

### 2. Investor does not authorize in time

```text
PENDING_INVESTOR_AUTHORIZATION
-> EXPIRED
```

Only an unsigned request in `PENDING_INVESTOR_AUTHORIZATION` expires automatically. Authorization expiry does not silently expire later issuer/blockchain stages.

### 3. Issuer rejects the request

```text
PENDING_ISSUER_APPROVAL
-> ISSUER_REJECTED
```

No lock, payment, burn, or unlock transaction is required. The issuer rejection reason is stored in `issuerDecision.rejectionReason` and history.

### 4. Investor cancels before issuer approval

```text
PENDING_INVESTOR_AUTHORIZATION -> CANCELLED
```

or:

```text
PENDING_ISSUER_APPROVAL -> CANCELLED
```

Cancellation is immediate because the platform has not started token locking.

### 5. Investor cancels after approval but before payment

Possible starting statuses are `ISSUER_APPROVED`, `TOKEN_LOCK_SUBMITTED`, or `TOKENS_LOCKED`.

If no lock exists on-chain:

```text
... -> CANCELLATION_PENDING -> CANCELLED
```

If the lock exists:

```text
... -> CANCELLATION_PENDING -> UNLOCK_SUBMITTED -> CANCELLED
```

The backend never marks the request cancelled while a redemption-created token lock may still exist.

### 6. Investor tries to cancel after issuer payment submission

Cancellation is rejected once the main status is `PAYMENT_SUBMITTED` or later. Settlement must be completed or placed into manual review; the issuer must not lose USDT after paying.

### 7. Issuer payment has fewer than the required confirmations

```text
TOKENS_LOCKED -> PAYMENT_SUBMITTED
```

The API returns HTTP `200` with the current `PAYMENT_SUBMITTED` state and an `INSUFFICIENT_CONFIRMATIONS` error. The worker retries later. The frontend must not ask the issuer to send another payment.

### 8. Issuer sent USDT but frontend did not send the hash

The record can remain `TOKENS_LOCKED`. The global USDT event indexer scans safe blocks and matches:

```text
chainId
+ USDT contract
+ issuer payment wallet
+ investor wallet
+ exact raw amount
+ payment start block
```

When an exact match is found:

```text
TOKENS_LOCKED -> PAYMENT_CONFIRMED -> BURN_SUBMITTED -> ...
```

The actual event transaction hash is stored. The system never generates or guesses a hash.

### 9. Issuer provides an invalid or mismatched payment hash

Examples include wrong chain contract, sender, recipient, amount, function, or missing Transfer event.

```text
TOKENS_LOCKED -> PAYMENT_SUBMITTED -> TOKENS_LOCKED
```

The invalid hash is removed from the active redemption, the error is recorded, and payment returns to `AWAITING_ISSUER`. A valid payment can then be submitted. A hash already used by another redemption is rejected.

### 10. Blockchain/RPC is temporarily unavailable

The main status normally remains unchanged. The backend records `error.stage`, `error.code`, and `error.message`, sets synchronization back to `QUEUED`, and retries later. Typical retryable cases include:

- `TRANSACTION_NOT_FOUND`
- `INSUFFICIENT_CONFIRMATIONS`
- `RPC_UNAVAILABLE`
- `CHAIN_REORGANIZATION`

No duplicate issuer payment, lock, burn, or unlock should be initiated by the frontend.

### 11. Platform transaction was broadcast but DB missed the hash

For lock, burn, or unlock, the backend stores the preparation block before broadcasting. Recovery searches the safe range for the exact expected event and stores its authoritative `transactionHash`.

If no event exists in the safe range, the execution stage is reset to queued and may be safely submitted. The shared platform signer lease prevents concurrent platform Token Agent transactions from racing across workers/API instances.

### 12. Burn succeeds and no cleanup is needed

```text
BURN_SUBMITTED -> COMPLETED
```

The backend verified that no redemption-created frozen amount remains, so a separate unlock transaction is unnecessary.

### 13. Burn succeeds but frozen-token cleanup is needed

```text
BURN_SUBMITTED -> BURN_CONFIRMED -> UNLOCK_SUBMITTED -> COMPLETED
```

`BURN_CONFIRMED` is therefore a valid intermediate status, not an error.

### 14. Definitive lock, burn, unlock, or reconciliation failure

```text
current non-terminal status -> MANUAL_REVIEW
```

This is used when automatic continuation could duplicate a transaction, burn the wrong amount, accept the wrong payment, or leave tokens incorrectly frozen. Operations should inspect:

- `error.stage`, `error.code`, and `error.message`;
- `history` for actor and state transitions;
- `transactionHistory` for all real hashes and receipt metadata;
- current on-chain balances, frozen balance, events, and canonical receipts.

### 15. Retry is called repeatedly

Retry is idempotent. For a non-terminal status it queues reconciliation of the same record. For `COMPLETED`, `ISSUER_REJECTED`, `CANCELLED`, `EXPIRED`, or `MANUAL_REVIEW`, it returns the existing state without starting new work.

## Actor action matrix

| Current status | Investor can do | Issuer can do | Backend/worker behavior |
|---|---|---|---|
| `PENDING_INVESTOR_AUTHORIZATION` | Authorize or cancel | View only | Expire unsigned request at deadline. |
| `PENDING_ISSUER_APPROVAL` | Wait or cancel | Approve or reject | No blockchain execution. |
| `ISSUER_APPROVED` | Cancel before payment | Wait | Submit/recover token lock. |
| `TOKEN_LOCK_SUBMITTED` | Request cancellation | Wait | Verify/recover lock. |
| `TOKENS_LOCKED` | Request cancellation if payment has not started | Send USDT and confirm hash | Scan for missed payment event. |
| `PAYMENT_SUBMITTED` | Wait | Do not pay again | Verify/recover payment. Cancellation is blocked. |
| `PAYMENT_CONFIRMED` | Wait | Do not pay again | Submit/recover burn. |
| `BURN_SUBMITTED` | Wait | Wait | Verify/recover burn. |
| `BURN_CONFIRMED` | Wait | Wait | Submit/recover cleanup unlock. |
| `UNLOCK_SUBMITTED` | Wait | Wait | Verify unlock and finish as completed/cancelled. |
| `CANCELLATION_PENDING` | Wait | Do not pay | Prove no lock or unlock confirmed tokens. |
| `COMPLETED` | View history | View history | No work. |
| `ISSUER_REJECTED` | View reason | View decision | No work. |
| `CANCELLED` | View history | View history | No work. |
| `EXPIRED` | Create a new request | View only | No work. |
| `MANUAL_REVIEW` | Contact support | Contact support | Automatic work is stopped. |

## Frontend display and polling rules

Recommended UI grouping:

- **Action required — investor:** `PENDING_INVESTOR_AUTHORIZATION`
- **Action required — issuer:** `PENDING_ISSUER_APPROVAL`, `TOKENS_LOCKED`
- **Blockchain processing:** `ISSUER_APPROVED`, `TOKEN_LOCK_SUBMITTED`, `PAYMENT_SUBMITTED`, `PAYMENT_CONFIRMED`, `BURN_SUBMITTED`, `BURN_CONFIRMED`, `UNLOCK_SUBMITTED`, `CANCELLATION_PENDING`
- **Successful terminal:** `COMPLETED`
- **Closed terminal:** `ISSUER_REJECTED`, `CANCELLED`, `EXPIRED`
- **Support required:** `MANUAL_REVIEW`

Poll the detail API while a blockchain-processing status is visible. Polling every 5–10 seconds while the page is visible is sufficient; avoid overlapping requests. Stop automatic polling for terminal statuses and show a support/contact action for `MANUAL_REVIEW`.

Always display the stage-specific transaction hash when available. A status ending in `_SUBMITTED` must be presented as processing, never as confirmed or completed.

## Operational interpretation checklist

When investigating a redemption, read fields in this order:

1. `status` — current business lifecycle.
2. `error` — current failure stage and code, if any.
3. `synchronization.status` and attempts — worker state.
4. `lock`, `payment`, `burn`, and `unlock` — stage-specific hash and confirmation state.
5. `history` — who caused every business transition.
6. `transactionHistory` — authoritative hash-level audit trail.

The invariant is:

```text
COMPLETED
= exact issuer USDT payment independently confirmed
+ exact investor token amount burned
+ every redemption-created token lock safely cleared
```
