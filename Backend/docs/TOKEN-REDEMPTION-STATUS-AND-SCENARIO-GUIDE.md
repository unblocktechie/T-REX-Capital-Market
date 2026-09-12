# Token Redemption Status and Scenario Guide

## Two status layers

The application deliberately separates the off-chain redemption request from canonical blockchain
proof:

| Layer | Table | Authority |
| --- | --- | --- |
| Business request | `tokenRedemption` | Investor request/authorization and Issuer decision |
| Blockchain execution | `blockchainTransaction` | Verified transaction, receipt, events, contract state, and indexer |

The frontend must not interpret an approved business request as a completed blockchain redemption.

## Active business statuses

| Status | Owner/source | Meaning and next action |
| --- | --- | --- |
| `PENDING_INVESTOR_AUTHORIZATION` | Investor | Request exists; complete the existing wallet authorization or cancel. |
| `PENDING_ISSUER_APPROVAL` | Issuer | Issuer reviews and approves or rejects. |
| `ISSUER_APPROVED` | Issuer | Request is approved. Issuer checks USDT allowance/balance and signs `redeem(investor, token, amount)`. |
| `ISSUER_REJECTED` | Issuer | Terminal rejection; show the reason. |
| `CANCELLED` | Investor/system | Terminal cancellation before the blockchain redemption is submitted. |
| `EXPIRED` | Background expiry | Unsigned/incomplete request expired; create a new request if eligible. |
| `COMPLETED` | Blockchain verifier/indexer | Atomic burn and Issuer-to-Investor USDT settlement were independently verified. |
| `MANUAL_REVIEW` | Operations | Legacy or exceptional record needs operator review; never display it as completed. |

## Deprecated legacy settlement statuses

These values remain in the production enum only for historical compatibility. The new atomic
Controller flow must not create them:

- `TOKEN_LOCK_SUBMITTED`
- `TOKENS_LOCKED`
- `PAYMENT_SUBMITTED`
- `PAYMENT_CONFIRMED`
- `BURN_SUBMITTED`
- `BURN_CONFIRMED`
- `UNLOCK_SUBMITTED`
- `CANCELLATION_PENDING`

They represented the retired backend-orchestrated lock, separate Issuer transfer, platform burn, and
unlock stages. Do not branch new frontend execution on these values.

## Canonical blockchain statuses

| Status | Source | Frontend behavior |
| --- | --- | --- |
| `SUBMITTED` | Known hash, not yet final | Show pending and poll/refresh; do not send a second transaction. |
| `CONFIRMED` | All verification passed at the required confirmation depth | Show successful redemption and refresh request/history/balances. |
| `FAILED` | Mined receipt reverted | Show transaction failure; the business request is not automatically completed. |
| `ORPHANED` | Reorg reconciliation | Hide success and wait for reconciliation/operator guidance. |

## Normal issuer-executed scenario

```text
Investor creates request
  -> PENDING_INVESTOR_AUTHORIZATION
Investor authorizes
  -> PENDING_ISSUER_APPROVAL
Issuer approves
  -> ISSUER_APPROVED
Issuer approves Controller USDT spending if needed
Issuer signs redeem(investor, token, tokenAmount)
  -> canonical SUBMITTED while confirmations are pending
Backend/API/indexer verifies transaction
  -> canonical CONFIRMED
  -> business COMPLETED
```

The one on-chain call burns the Investor's token amount and transfers the quoted USDT amount from
Issuer to Investor. The Backend never executes either action.

## Rejection and cancellation

- Before Issuer approval, the Issuer may reject and the Investor may cancel under the existing
  business rules.
- Once a redemption transaction hash exists or the chain already contains the matching atomic
  redemption, do not allow cancellation to imply that settlement did not happen.
- A rejected MetaMask prompt creates no blockchain transaction; keep the business request approved
  so the Issuer may intentionally try again.
- A mined reverted hash becomes canonical `FAILED`, not business `COMPLETED`.

## Allowance and balance failures

- `InsufficientIssuerAllowance`: show Approve USDT, wait for the approval receipt, re-read allowance,
  and only then enable Redeem.
- `InsufficientIssuerBalance`: ask the Issuer to fund the same organization wallet.
- Approval is reusable. Do not require another approval while current on-chain allowance is enough.
- Database approval flags are informational only; current contract reads are authoritative.

## Browser/backend outage

If the Issuer transaction succeeds but the browser closes before `/transactions/confirm`:

1. `tokenRedemption` may temporarily remain `ISSUER_APPROVED`.
2. The token burn event appears in the confirmed block range.
3. The canonical indexer discovers it from `lastIndexedBlock`.
4. The same strict verifier validates calldata, sender, Controller, events, quote, and receipt.
5. One canonical `REDEMPTION` row is upserted and the request becomes `COMPLETED`.

The Issuer must not submit another redemption merely because the backend record has not caught up.

## Idempotency

Calling the confirmation endpoint multiple times with the same hash updates the same canonical row.
The matching request is selected by token, Investor recipient wallet, and raw token amount. Once it is
`COMPLETED`, subsequent verification does not append another completion history row.

## Role rules

- Investor JWT: may confirm `INVEST` and `TRANSFER` transactions originating from that Investor's
  registered wallet.
- Issuer JWT: may confirm only the new issuer-executed `REDEMPTION` for a token owned by that Issuer,
  and only when `tx.from` equals the stored organization wallet.
- The global indexer has no user session, but it enforces the same on-chain sender and token-owner
  relationship before synchronization.
