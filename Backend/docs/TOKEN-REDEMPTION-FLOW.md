# Token Redemption Flow

## Settlement model

Redemption is manual on the issuer side and backend-authoritative on the settlement side:

1. Investor creates a redemption intent.
2. Investor signs the exact EIP-712 authorization returned by the backend.
3. Issuer approves or rejects the request.
4. The platform Token Agent locks the redemption token amount with `freezePartialTokens`.
5. After the lock is canonically confirmed, the issuer sends the exact USDT amount from the stored treasury/payment wallet to the registered investor wallet.
6. The issuer submits only the payment transaction hash.
7. The backend verifies the chain, sender, contract, calldata, raw amount, receipt, canonical block and Transfer event.
8. The platform Token Agent calls `burn(investorWalletAddress, tokenAmountRaw)`.
9. The backend verifies the exact burn and releases any redemption-created partial freeze that remains after burn.
10. Only then is the redemption `COMPLETED`.

The payment amount uses the token's stored `initialTokenPrice`; values are calculated in integer base units and rounded upward only when a USDT base-unit fraction occurs. There is currently no redemption fee.

## Safety invariants

- Investor, token, treasury, USDT and platform addresses come only from backend state/configuration.
- A registered investment and active investor/issuer/token are required.
- The requested amount cannot exceed `balanceOf - getFrozenTokens` at intent creation.
- An active purchase and redemption cannot overlap for the same investment.
- The EIP-712 signature must recover the registered investor wallet and expires after `REDEMPTION_AUTHORIZATION_TTL_MINUTES`.
- The issuer can act only on redemptions owned by its organization.
- Issuer payment is accepted only after the platform token lock is confirmed.
- Burn is never submitted until payment is independently verified.
- A payment transaction hash and every platform transaction hash are globally unique in the redemption ledger.
- Every on-chain confirmation includes a canonical block-hash check and `REDEMPTION_CONFIRMATIONS` confirmations.
- Platform lock, burn and unlock operations share a database lease, preventing concurrent signer execution across API instances.
- Append-only history and transaction tables retain business decisions, settlement transitions, and submitted/failed/confirmed hashes.

## Status lifecycle

```text
PENDING_INVESTOR_AUTHORIZATION
  -> PENDING_ISSUER_APPROVAL
  -> ISSUER_APPROVED
  -> TOKEN_LOCK_SUBMITTED
  -> TOKENS_LOCKED
  -> PAYMENT_SUBMITTED
  -> PAYMENT_CONFIRMED
  -> BURN_SUBMITTED
  -> BURN_CONFIRMED       (only when lock cleanup is required)
  -> UNLOCK_SUBMITTED     (only when lock cleanup is required)
  -> COMPLETED
```

Terminal/exception paths are `ISSUER_REJECTED`, `CANCELLED`, `EXPIRED`, and `MANUAL_REVIEW`.
`CANCELLATION_PENDING` means the request cannot be marked cancelled until a possibly confirmed lock is found and released.

The independent `lockStatus`, `paymentStatus`, `burnStatus`, `unlockStatus`, and `syncStatus` fields explain progress without overloading the main business status.

## APIs

Investor:

- `POST /api/v1/investments/tokens/:tokenUid/redemptions`
- `POST /api/v1/investments/redemptions/:redemptionUid/authorize`
- `GET /api/v1/investments/tokens/:tokenUid/redemptions?page=1&limit=20&search=&status=all`
- `GET /api/v1/investments/redemptions/:redemptionUid`
- `POST /api/v1/investments/redemptions/:redemptionUid/cancel`
- `POST /api/v1/investments/redemptions/:redemptionUid/retry`

Issuer:

- `GET /api/v1/investments/issuer/redemptions?page=1&limit=20&search=&status=all`
- `GET /api/v1/investments/issuer/redemptions/:redemptionUid`
- `POST /api/v1/investments/issuer/redemptions/:redemptionUid/approve`
- `POST /api/v1/investments/issuer/redemptions/:redemptionUid/reject`
- `POST /api/v1/investments/issuer/redemptions/:redemptionUid/payment/confirm`

Create sample:

```json
{
  "tokenAmount": "1.25",
  "idempotencyKey": "redeem-20260910-0001"
}
```

Authorize sample:

```json
{
  "signature": "0x<65-byte EIP-712 signature>"
}
```

Issuer payment confirmation accepts no transaction parameters besides the hash:

```json
{
  "txHash": "0x<32-byte USDT transfer hash>"
}
```

When `TOKENS_LOCKED`, the issuer detail response contains the authoritative:

- `usdtContractAddress`
- `issuerPaymentWalletAddress`
- `investorWalletAddress`
- `usdtAmountRaw`
- `usdtDecimals`
- `chainId`

The frontend must call `transfer(investorWalletAddress, usdtAmountRaw)` on the returned USDT contract from `issuerPaymentWalletAddress`.

## Recovery architecture

The `tokenRedemptionPayment` checkpoint scans configured USDT Transfer events sequentially up to the safe head, persists them, then matches exact payable redemptions by:

```text
chainId + USDT contract + issuer payment wallet + investor wallet + raw amount + payment start block
```

This recovers a payment when MetaMask succeeded but the frontend never sent its hash.

Targeted recovery handles platform operations:

- prepared lock without stored hash -> search exact `TokensFrozen` event;
- prepared burn without stored hash -> search exact investor-to-zero `Transfer` event;
- prepared unlock without stored hash -> search exact `TokensUnfrozen` event.

The real event transaction hash is stored. If the now-safe range contains no matching event, the leased worker may safely submit the missing platform action. Repeated Retry/API/worker calls never insert a second redemption or deliberately submit a second transaction.

## Cancellation and failure handling

- Before issuer approval: cancellation is immediate.
- After approval/lock submission but before issuer payment: cancellation becomes `CANCELLATION_PENDING`; a confirmed lock is released on-chain first.
- After issuer payment submission: cancellation is rejected.
- Definitive unexpected settlement mismatches move the request to `MANUAL_REVIEW`; the worker does not guess a hash or continue to burn.
- If USDT is paid and burn fails transiently, payment stays confirmed and burn retries; the issuer is never asked to pay again.

Required runtime configuration:

```dotenv
REDEMPTION_USDT_ADDRESS=0x...
REDEMPTION_CONFIRMATIONS=12
REDEMPTION_AUTHORIZATION_TTL_MINUTES=30
REDEMPTION_INDEXER_START_BLOCK=0
REDEMPTION_WORKER_ENABLED=true
```

Set `REDEMPTION_INDEXER_START_BLOCK` to a block no later than the earliest possible issuer redemption payment on the configured chain. Monitor the `tokenRedemptionPayment` and shared `platformTokenAgentExecution` rows in `blockchainIndexerCheckpoint`.
