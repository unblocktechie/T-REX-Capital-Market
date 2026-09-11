# Canonical blockchain transaction indexer

This worker is the fallback/source-of-truth ingestion path for frontend-executed Invest, Transfer,
and Redemption transactions.

It scans sequential safe block ranges using the global `canonicalTransactions` row in
`blockchainIndexerCheckpoint`. It monitors the configured USDT contract for settlement events sent
through the Platform Controller and every active deployed token for ERC-20 `Transfer` events. Every
candidate is passed to the same strict verifier used by the fast confirmation endpoint.

The verifier requires the configured chain, correct target and supported function, deployed token,
canonical successful receipt, exact issue/burn/transfer event, exact settlement direction and
amount from `quoteBuy`/`quoteRedeem`, configured payment token, controller token metadata, and the
configured confirmation threshold. API confirmation additionally requires the authenticated
investor wallet to equal `tx.from`.

`blockchainIndexedContract` tracks one-time backfill progress for each newly discovered deployed
token. This closes the race where the global checkpoint advanced while a newly deployed token had
not yet been synchronized into the database. New-contract backfill is chunked and idempotent.

Rows are idempotent by `(chainId, transactionHash, type)` and event identity by
`(chainId, transactionHash, logIndex)`. Checkpoints advance only after all candidates in a range
have been examined. On checkpoint block-hash mismatch, the worker marks affected rows `ORPHANED`,
rewinds by the configured lookback, and replays the range.

Runtime settings are available in `.env` and `generalSettings`. Apply
`database/migrations/20260911_add_canonical_blockchain_transactions.sql` before starting the app.
Set `TRANSACTION_INDEXER_START_BLOCK` to the earliest relevant Platform Controller transaction or
deployed-token activity block when historical backfill is required.
