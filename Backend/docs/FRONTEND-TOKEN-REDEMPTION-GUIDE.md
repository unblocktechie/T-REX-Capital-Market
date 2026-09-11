# Frontend Token Redemption Guide (deprecated settlement)

> Retain only the off-chain redemption request and issuer review portions. Replace all direct issuer
> payment-confirm and backend burn/unlock steps with the frontend wallet/controller flow in
> `FRONTEND-BLOCKCHAIN-TRANSACTION-GUIDE.md`.

## Investor flow

1. Call `POST /api/v1/investments/tokens/:tokenUid/redemptions` with a decimal `tokenAmount` and a new idempotency key.
2. Persist `data.redemptionUid` locally.
3. Pass `data.authorization.typedData.domain`, `.types`, and `.message` unchanged to the connected wallet library's `signTypedData` method. Do not rebuild amounts using JavaScript floating point.
4. Send the wallet signature to `POST /api/v1/investments/redemptions/:redemptionUid/authorize`.
5. Show `PENDING_ISSUER_APPROVAL` and poll the detail endpoint, or refresh it when the screen regains focus.
6. Once approved, render the returned lock/payment/burn sub-statuses. The investor does not submit a token transaction.
7. When the request reaches `COMPLETED`, show both the verified issuer payment hash and platform burn hash.

Use `GET /api/v1/investments/tokens/:tokenUid/redemptions?page=1&limit=20&search=&status=all` for the table. Search and status filtering are backend-side.

Cancellation behavior:

- `CANCELLED`: finished immediately.
- `CANCELLATION_PENDING`: keep polling; the backend must release a confirmed lock before final cancellation.
- HTTP `409 REDEMPTION_CANCELLATION_NOT_ALLOWED`: issuer payment has already started and cancellation is no longer safe.

## Issuer flow

1. Load the queue using `GET /api/v1/investments/issuer/redemptions`.
2. Review detail and the verified investor authorization state.
3. Approve or reject. Approval queues/submits the platform lock; it does not open MetaMask.
4. Poll detail until `status === "TOKENS_LOCKED"` and `payment.status === "AWAITING_ISSUER"`.
5. Validate MetaMask is connected to `data.chainId` and the account equals `data.issuerPaymentWalletAddress` (case-insensitive checksum comparison).
6. Instantiate the exact `data.usdtContractAddress` and call:

```solidity
transfer(data.investorWalletAddress, data.usdtAmountRaw)
```

7. After MetaMask returns a hash, immediately call `POST /api/v1/investments/issuer/redemptions/:redemptionUid/payment/confirm` with only `{ txHash }`.
8. A `200` response can still represent `PAYMENT_SUBMITTED`, `BURN_SUBMITTED`, or another in-progress status. Always branch on `data.status`, not only HTTP status.
9. Continue detail polling until `COMPLETED` or `MANUAL_REVIEW`.

Never send wallet addresses, token amount, USDT amount, contract address, chain ID, or recipient in the confirm request. The backend compares the actual transaction with the stored authoritative intent.

## Refresh/crash recovery

- If MetaMask was never confirmed, the unsigned request expires only while it is still `PENDING_INVESTOR_AUTHORIZATION`.
- If the issuer USDT transaction succeeded but the confirm request was missed, do not send USDT again. Call detail/Retry; the global payment indexer will match the exact event.
- If a platform lock/burn/unlock hash was missed during a backend crash, keep polling. The worker searches the exact event before it submits anything again.
- Retry is a synchronization action, not a new financial transaction.

Recommended polling: every 5-10 seconds while the screen is visible, with exponential backoff after network failures. Stop polling at `COMPLETED`, `ISSUER_REJECTED`, `CANCELLED`, or `EXPIRED`. Show a support/contact action for `MANUAL_REVIEW`.
