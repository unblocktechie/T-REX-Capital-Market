# Token Redemption Flow

## Current model

Redemption keeps its off-chain request/approval workflow, but settlement is one atomic blockchain
transaction executed by the token-owning Issuer. The backend observes and verifies that transaction;
it never signs, relays, burns tokens, or transfers USDT.

```text
Investor creates request
  -> existing investor authorization step
  -> Issuer reviews and approves/rejects
  -> Issuer ensures Controller USDT allowance
  -> Issuer signs redeem(investor, token, tokenAmount)
  -> Controller burns investor tokens and transfers Issuer USDT to Investor
  -> frontend submits txHash (optional fast path)
  -> backend verifier or canonical indexer confirms it
  -> canonical transaction CONFIRMED + matching redemption COMPLETED
```

The investor does not execute the final redemption transaction. The Issuer does not send a separate
USDT transfer. The Platform Controller performs the burn and payment atomically.

## APIs in order

Investor business workflow:

1. `POST /api/v1/investments/tokens/:tokenUid/redemptions`
2. `POST /api/v1/investments/redemptions/:redemptionUid/authorize`
3. `GET /api/v1/investments/redemptions/:redemptionUid`
4. `POST /api/v1/investments/redemptions/:redemptionUid/cancel` when still cancellable

Issuer business workflow:

1. `GET /api/v1/investments/issuer/redemptions`
2. `GET /api/v1/investments/issuer/redemptions/:redemptionUid`
3. `POST /api/v1/investments/issuer/redemptions/:redemptionUid/approve` or `/reject`

Issuer blockchain synchronization after approval:

```http
POST /api/v1/investments/transactions/confirm
Authorization: Bearer <issuerAccessToken>
Content-Type: application/json
```

```json
{
  "chainId": 5042002,
  "txHash": "0x...",
  "tokenUid": "<tokenUid>",
  "expectedAction": "REDEMPTION"
}
```

The confirmation API is optional for execution but recommended for fast UI synchronization. If it
is missed, the canonical checkpointed indexer detects the token burn event and runs the same
verifier.

## Issuer frontend execution

1. Require the connected wallet to equal the organization wallet returned by backend state.
2. Read `USDT.allowance(issuerWallet, controllerAddress)` from chain.
3. If insufficient, have the Issuer approve the Controller and re-read allowance after mining.
4. Check the Issuer USDT balance for UX; the contract remains authoritative.
5. Call `redeem(investorWalletAddress, tokenAddress, tokenAmountRaw)` on the Controller.
6. Persist the returned hash locally and call `/investments/transactions/confirm` with the Issuer JWT.
7. Treat `SUBMITTED` as waiting, not failure. Refresh transaction/redemption history.
8. Treat only `CONFIRMED`/`COMPLETED` as final success. Never send a second redemption because the
   backend is temporarily unavailable.

## Backend verification

The verifier independently requires all of the following:

- authenticated role is Issuer;
- token belongs to the authenticated Issuer's organization;
- outer transaction sender equals the stored organization wallet;
- delegated execution manager is allowlisted when delegation is used;
- effective call target equals the Controller stored for that token;
- function is `redeem(address investor,address token,uint256 tokenAmount)`;
- calldata token matches the deployed backend token and amount is positive;
- receipt succeeded and its block remains canonical;
- token `Transfer(investor, zeroAddress, tokenAmount)` burn exists;
- USDT `Transfer(issuer, investor, paymentAmount)` exists;
- `TokensRedeemed(investor, token, issuer, tokenAmount, paymentAmount, price)` exists on the expected
  Controller and matches the calldata/DB context;
- Controller payment token, token configuration, quote, decimals, issuer, price, and amount match;
- configured confirmation threshold is reached before final `CONFIRMED`.

Frontend-supplied investor, wallet, amount, controller, settlement, or status values are never
accepted as proof. Only `chainId`, `txHash`, `tokenUid`, and `expectedAction` are accepted as lookup
context.

## Status ownership

Canonical blockchain status is stored in `blockchainTransaction`:

- `SUBMITTED`: known hash but not yet final under the configured confirmations.
- `CONFIRMED`: the complete on-chain verification passed.
- `FAILED`: mined transaction reverted.
- `ORPHANED`: previously recorded block is no longer canonical.

The existing `tokenRedemption` business statuses remain for request compatibility. The important
active stages are:

- `PENDING_INVESTOR_AUTHORIZATION`
- `PENDING_ISSUER_APPROVAL`
- `ISSUER_APPROVED`
- `ISSUER_REJECTED`
- `CANCELLED`
- `EXPIRED`
- `COMPLETED`

When the canonical redemption becomes `CONFIRMED`, the matching non-terminal redemption is updated
idempotently to `COMPLETED`; the verified hash/receipt fields are copied to the legacy payment/burn
columns for compatibility, and one `ONCHAIN_REDEMPTION_CONFIRMED` history event is appended.

## Recovery and idempotency

The global canonical indexer scans confirmed token `Transfer` events from its persisted checkpoint.
A burn event identifies a redemption candidate. The indexer then fetches the full transaction and
uses the same strict verification path as the confirmation API. This recovers the record when the
browser closes, the confirm API fails, or the backend was offline when the transaction mined.

Canonical uniqueness is enforced by chain, transaction hash, action/event. Replaying the same hash
updates the same row and does not repeat the blockchain transaction or append duplicate completion
history.

## Migration

Apply migrations through:

1. `20260911_add_canonical_blockchain_transactions.sql`
2. `20260911_repair_blockchain_transaction_permissions.sql`
3. `20260912_allow_issuer_redemption_confirmation.sql`

The last migration grants the Issuer role access to the canonical confirmation endpoint. It does not
grant Issuers permission to confirm INVEST or TRANSFER: service-level action and wallet ownership
checks still reject those calls.
