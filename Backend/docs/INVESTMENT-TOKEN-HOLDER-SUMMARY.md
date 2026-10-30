# Token-details holder summary

`GET /api/v1/investments/tokens/:tokenUid` retains its existing fields and adds
`data.holderSummary`: totalInvestors, currentHolders, formerHolders, unknownHolders,
balanceBlockNumber and balanceVerifiedAt.

Counts cover distinct registered investor wallets with confirmed canonical INVEST
events or completed legacy purchases for this token and chain. Transfer-only
recipients are not included. These are not total on-chain holder counts.

The standalone TokenHolderSummaryService works without the newer admin module.
It reads balanceOf at one block, validates the RPC chain ID and block hash, and
never signs or sends a transaction. A positive raw balance is current, zero is
former, and a failed check remains unknown. Counts do not use floating point.

Reads use at most three concurrent wallet calls, RPC batches of at most three,
a five-second individual timeout, and a fifteen-second RPC budget. Configured
fallback RPCs are tried within that budget. Results have a thirty-second cache
isolated by chain and token, capped at one hundred entries, with shared in-flight
requests. The verified block/time accompanies successful checks; unknown-only
results may have no verified block. SQL errors are not disguised as zero counts.

No migration, frontend request change, or new environment variable is required.
