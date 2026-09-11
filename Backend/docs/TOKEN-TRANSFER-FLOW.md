# ERC-3643 Token Transfer Flow (legacy)

> Deprecated on 2026-09-11. New sends call the token `transfer()` directly from the investor wallet.
> The backend records the result through the canonical confirm API/indexer; it does not create an
> intent or prepare calldata. See `FRONTEND-BLOCKCHAIN-TRANSACTION-GUIDE.md`.

This flow lets a registered investor send a deployed platform token to another investor who is
already registered and verified for the same token. The database records intent before MetaMask,
and only independently verified on-chain evidence can change the intent to `COMPLETED`.

## Statuses

| Status | Meaning | Owner |
|---|---|---|
| `PENDING_TRANSFER` | Backend intent exists; transaction may not be submitted, mined, or sufficiently confirmed yet. | Investor/blockchain |
| `COMPLETED` | Exact transaction, receipt, canonical block, Transfer event, and block-state balances were verified. | Blockchain |
| `EXPIRED` | No hash or matching safe-chain event was found before the intent deadline and grace period. | Worker |
| `MANUAL_REVIEW` | Reserved terminal safety state for an operation that cannot be reconciled automatically. | Operations |

HTTP `200` does not itself mean the transfer completed. The frontend must read `data.status`.

## APIs

### Create intent

`POST /api/v1/investments/tokens/{tokenUid}/transfers`

```json
{
  "recipientWalletAddress": "0x4444444444444444444444444444444444444444",
  "tokenAmount": "1.25",
  "idempotencyKey": "send-20260910-0001"
}
```

The backend validates both investor profiles, both `registered` investment interests, token and
Identity Registry addresses, ONCHAINID values, registry verification, token pause state,
`canTransfer`, sender unfrozen balance, recipient holder cap, decimals, and absence of another
active send for the same sender/token. It snapshots `currentTokenPrice` as `tokenPrice` for an
auditable transfer-time valuation; the ERC-3643 transfer itself still moves the exact token amount
and does not perform a USDT conversion. It stores normalized authoritative values before returning:

```json
{
  "transferUid": "uuid",
  "status": "PENDING_TRANSFER",
  "transactionRequest": {
    "contractAddress": "0xToken",
    "functionName": "transfer",
    "args": ["0xRecipient", "125"],
    "from": "0xSender",
    "chainId": 11155111
  }
}
```

The frontend must use this `transactionRequest`. It must not recalculate the raw amount or replace
the token, sender, recipient, or chain.

### Confirm hash

`POST /api/v1/investments/transfers/{transferUid}/confirm`

```json
{ "txHash": "0x64-hex-characters" }
```

The endpoint accepts only `txHash`. It verifies:

1. hash format and uniqueness;
2. configured chain and transaction chain;
3. `tx.to` equals the stored token contract;
4. `tx.from` equals the stored sender wallet;
5. zero native value and exact `transfer(address,uint256)` selector;
6. decoded recipient and raw amount equal the pending record;
7. successful receipt and configured confirmations;
8. receipt block remains canonical;
9. exact token `Transfer(sender, recipient, amount)` event;
10. sender, recipient, and frozen balances at the receipt block.

Only then does the same row become `COMPLETED`. Repeating the same hash is idempotent. A hash used
by another transfer is rejected.

### Detail, history, and retry

- `GET /api/v1/investments/transfers/{transferUid}` is available to its sender and recipient and
  includes the append-only hash verification history.
- `GET /api/v1/investments/tokens/{tokenUid}/transfers?page=1&limit=20&search=&status=all&direction=all`
  lists sent and received rows. `direction` supports `sent`, `received`, and `all`.
- `POST /api/v1/investments/transfers/{transferUid}/retry` queues synchronization. It never
  broadcasts a blockchain transaction. A deterministic invalid transaction returns guidance that
  a new wallet transaction is required; its next Confirm call may provide the replacement hash.

## Frontend sequence

1. Generate and persist an idempotency key for one click.
2. Create the pending transfer.
3. If an existing intent is returned, resume it instead of creating another.
4. Call the returned token contract `transfer(recipient, amountRaw)` from `from` on `chainId`.
5. Send only the resulting hash to Confirm.
6. If Confirm returns `PENDING_TRANSFER`, poll detail or use Retry; do not submit another transfer.
7. Submit a new wallet transaction only after a deterministic verification error says a
   transaction is required.
8. Refresh transfer history and portfolio after `COMPLETED`.

## Fallback and failure scenarios

The `tokenTransfer` global indexer moves sequentially through safe blocks. It batches every deployed
platform token address, stores Transfer events before advancing `blockchainIndexerCheckpoint`, and
matches only the exact tuple:

```text
chainId + tokenAddress + senderWalletAddress + recipientWalletAddress + tokenAmountRaw
```

- **Frontend receives a hash but backend confirm fails:** the submitted hash remains on the pending
  row and the worker verifies it later.
- **Blockchain succeeds but frontend closes before sending the hash:** the global event ledger finds
  and verifies the event, stores its actual transaction hash, and confirms the existing row.
- **A newly deployed token is missed by one address snapshot:** targeted recovery scans only from
  that intent's `preparedAtBlock` to the safe head for the exact sender/recipient topics.
- **Backend stops:** the durable checkpoint and pending row resume after restart.
- **RPC outage or insufficient confirmations:** status remains `PENDING_TRANSFER`; verification is
  queued with no duplicate transaction.
- **Wrong contract, sender, function, recipient, amount, reverted receipt, missing event, or stale
  canonical block:** never confirm. The invalid hash is retained in audit history and can be replaced
  through Confirm after the frontend creates the correct transaction.
- **MetaMask is closed/rejected and no transaction exists:** expiry runs only after the indexer has
  caught up to the safe head and confirmed there is no matching event. The row becomes `EXPIRED`.
- **DB failure after event storage:** checkpoint safety and event processing status cause the same
  event to retry; uniqueness prevents duplicate rows.

Operational tables are `tokenTransfer`, `tokenTransferTransaction`,
`tokenTransferBlockchainEvent`, and `blockchainIndexerCheckpoint` (`indexerName = tokenTransfer`).

## Configuration

```env
TRANSFER_CONFIRMATIONS=2
TRANSFER_INDEXER_CONFIRMATIONS=2
TRANSFER_INTENT_TTL_MINUTES=15
TRANSFER_INDEXER_START_BLOCK=0
TRANSFER_WORKER_ENABLED=true
```

Both interactive verification and the background indexer use the standardized two-block threshold.
Set `TRANSFER_INDEXER_START_BLOCK` to the earliest deployed platform token block to avoid
unnecessary historical scanning.
