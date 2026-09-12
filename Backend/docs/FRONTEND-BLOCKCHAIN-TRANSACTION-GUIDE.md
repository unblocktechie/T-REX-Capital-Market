# Frontend wallet transaction integration

## Final architecture

Invest, Send, and Redeem are wallet-to-contract operations. The backend is never a transaction
prerequisite and never signs, relays, mints, burns, transfers USDT, or retries these transactions.

```text
User wallet -> Platform Controller / token contract -> blockchain
                                           |
                      transaction hash ----+
                                           v
Frontend -> optional fast confirmation API -> canonical transaction history
Blockchain -> checkpointed fallback indexer -> canonical transaction history
```

The fast API and indexer use the same verifier and idempotent database upsert. Calling the API is
recommended for immediate UI feedback, but failure to call it does not affect the on-chain action.

## API endpoints

### Confirm an observed wallet transaction

`POST /api/v1/investments/transactions/confirm`

Authenticated wallet-owner request. Use the Investor JWT for `INVEST`/`TRANSFER` and the owning
Issuer JWT for the new issuer-executed `REDEMPTION`:

```json
{
  "chainId": 11155111,
  "txHash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "tokenUid": "02647af2-e585-4c03-8984-108e1e44c616",
  "expectedAction": "INVEST"
}
```

`expectedAction` is `INVEST`, `TRANSFER`, or `REDEMPTION`. The backend loads the transaction and
never trusts client amounts, wallets, recipient, token address, price, USDT amount, or status.

The response is always HTTP 200 after the hash is structurally and contextually valid:

- `SUBMITTED`: valid supported call found, but it is unmined or below the configured confirmation
  threshold. Do not ask the wallet to send again.
- `CONFIRMED`: current canonical receipt, expected events, exact controller quote, wallets, token,
  amount, and chain were independently verified and saved.
- `FAILED`: a mined reverted transaction was saved. The UI may allow a new wallet action.

Definitive mismatches use 4xx codes and must never be displayed as successful transactions.
Temporary RPC failures use 503; the indexer can still recover the transaction later.

### History

`GET /api/v1/investments/transactions`

Supported query parameters:

```text
page, limit, tokenUid, type, status, walletAddress, txHash, fromDate, toDate, search
```

Investor results are wallet-scoped. Issuer results are organization-scoped. Super Administrator
can view all rows. Poll this endpoint after a `SUBMITTED` response until the row becomes
`CONFIRMED`, or refresh it when the app/window regains focus.

`GET /api/v1/investments/transactions/export` accepts the same filters and downloads the full
filtered CSV result, not only the visible page.

## Invest / Buy

1. Use the token's returned `tokenAgentWalletAddress` as its assigned Platform Controller, then read
   that Controller's token configuration and quote on-chain. Do not replace an existing token's
   stored Controller with the current new-token default.
2. Read `USDT.allowance(investorWallet, controllerAddress)` on-chain.
3. If insufficient, investor signs `USDT.approve(controllerAddress, amount or MaxUint256)`.
4. Re-read allowance after the approval receipt succeeds.
5. Investor signs `PlatformController.buy(tokenAddress, tokenAmountRaw)`.
6. As soon as a hash is returned, call `/transactions/confirm` with `expectedAction: INVEST`.
7. Show `SUBMITTED` immediately and refresh canonical history. Never submit `buy` again solely
   because the backend request failed or timed out.

Remove these old calls:

```text
POST /investments/tokens/:tokenUid/purchases
POST /investments/purchases/:purchaseUid/confirm
POST /investments/purchases/:purchaseUid/retry
```

Legacy purchase GET endpoints remain temporarily read-only for historical production records, but
new UI history must use `/investments/transactions?type=INVEST`.

## Send / Transfer

1. Validate input and connected investor wallet in the UI.
2. Read eligibility/compliance information as needed for UX; the ERC-3643 contracts remain the
   execution authority.
3. Investor signs `token.transfer(recipientWallet, tokenAmountRaw)` directly.
4. Call `/transactions/confirm` with `expectedAction: TRANSFER`.
5. Refresh `/transactions?type=TRANSFER&tokenUid=...`.

Remove these old calls and all use of backend-prepared `transactionRequest`/calldata/gas:

```text
POST /investments/tokens/:tokenUid/transfers
POST /investments/transfers/:transferUid/confirm
POST /investments/transfers/:transferUid/retry
```

Legacy transfer GET endpoints remain temporarily read-only. New history uses the canonical API.

## Redemption

The off-chain request and issuer decision remain because they are business workflow, not blockchain
execution:

1. Investor creates and authorizes the redemption request.
2. Issuer approves or rejects it.
3. Issuer performs the reusable USDT allowance approval directly from the issuer wallet. Current
   on-chain allowance and balance—not a database boolean—determine readiness.
4. Issuer signs `PlatformController.redeem(investorWalletAddress, tokenAddress, tokenAmountRaw)`.
5. Call `/transactions/confirm` with the Issuer JWT and `expectedAction: REDEMPTION`.
6. Refresh canonical history and the redemption detail. The verified atomic controller transaction
   changes the matching legacy request to `COMPLETED` during migration.

Keep these business APIs:

```text
POST /investments/tokens/:tokenUid/redemptions
POST /investments/redemptions/:redemptionUid/authorize
POST /investments/redemptions/:redemptionUid/cancel
GET  /investments/tokens/:tokenUid/redemptions
GET  /investments/redemptions/:redemptionUid
GET  /investments/issuer/redemptions
GET  /investments/issuer/redemptions/:redemptionUid
POST /investments/issuer/redemptions/:redemptionUid/approve
POST /investments/issuer/redemptions/:redemptionUid/reject
```

Remove these old settlement calls:

```text
POST /investments/redemptions/:redemptionUid/retry
POST /investments/issuer/redemptions/:redemptionUid/payment/confirm
```

The investor never signs the final redemption transaction. The issuer must not send a separate USDT
transfer for each redemption. The backend must not burn or unlock tokens. The issuer-signed
controller call performs issuer-to-investor USDT settlement and investor token burn atomically.

## Recovery and UI rules

- Save a locally observed hash before making the backend request so a browser refresh can resume UI
  polling.
- Never automatically send another blockchain transaction because confirmation API/indexer status
  is delayed.
- If `/transactions/confirm` returns `SUBMITTED`, poll history with exponential backoff or refresh
  on focus; no MetaMask action is required.
- If the backend is unavailable, show the chain hash and a synchronization message. The checkpointed
  indexer discovers it after restart.
- Deduplicate UI rows by `chainId + transactionHash + type`; the database additionally protects the
  authoritative event identity with `chainId + transactionHash + logIndex`.
- Read allowance, balances, supply, pause state, and controller price from the blockchain. Backend
  values are reporting/cache data only.

## Removed frontend responsibilities

Delete recovery stores and timers whose purpose is to retry backend mint, burn, USDT payment,
unlock, or prepared-transfer stages. Keep only an observed transaction hash until canonical history
contains it. Replace issuer browser-side `Transfer` log scanning and page-only CSV generation with
the history and export endpoints above.
