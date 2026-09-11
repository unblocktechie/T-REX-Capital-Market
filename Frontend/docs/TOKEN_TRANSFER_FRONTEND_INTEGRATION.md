# Investor Token Transfer Frontend Integration

The investor **Send** flow is integrated with the transfer-intent APIs and keeps server state authoritative.

## Flow

1. A `send-*` idempotency key is persisted before the create-intent request.
2. `POST /investments/tokens/{tokenUid}/transfers` validates the recipient and amount and returns the authoritative `transactionRequest`.
3. The wallet broadcasts exactly that returned contract, sender, chain, recipient, and raw amount. The frontend does not rebuild the raw token amount for the wallet transaction.
4. The returned transaction hash is persisted immediately and sent alone to `POST /investments/transfers/{transferUid}/confirm`.
5. `PENDING_TRANSFER` is treated as pending even when Confirm returns HTTP 200. The page polls transfer detail and also provides a safe **Refresh transfer status** action backed by `/retry`; retry never broadcasts a wallet transaction.
6. A second wallet transaction is blocked while a hash is pending. A replacement transaction is exposed only when the confirm response explicitly says a new/replacement wallet transaction is required.
7. `COMPLETED` is displayed only after the transfer API returns `COMPLETED`. The frontend does not infer completion from a MetaMask hash or local receipt.
8. Wallet balance, transfer history, and portfolio data are refreshed after completion.

## Recovery

A pending transfer stores `transferUid`, idempotency key, recipient, amount, authoritative `transactionRequest`, and known transaction hash in local storage. On page reload the UI restores the server transfer and continues status synchronization without rebroadcasting a transaction. If the create request response was lost, the same idempotency key is replayed so an existing intent can be resumed safely.

## History

The Send screen uses `GET /investments/tokens/{tokenUid}/transfers` with pagination, search, status, and sent/received direction filters. Pending history refreshes automatically.
