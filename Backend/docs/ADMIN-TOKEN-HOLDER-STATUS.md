# Admin token details: current holder status

The investor-facing `GET /api/v1/investments/tokens/:tokenUid` also returns
`data.holderSummary` with `totalInvestors`, `currentHolders`, `formerHolders`,
and `unknownHolders`. It reuses the same chain-specific balance checks and cache
as the admin APIs. Counts cover historical investors in this token, not all
on-chain wallets. RPC failures count as unknown, never former. Existing token
details remain unchanged; investor identities are not exposed by this addition.
No database migration or new endpoint is needed.

`GET /api/v1/admin/tokens?page=1&limit=20` also includes `holderSummary`
inside each token object in `data`. Each summary counts all historical investors
for that token, regardless of token-list search or pagination. Existing list
fields and pagination stay unchanged. No migration is required.

Token-list sorting: `sortBy` accepts createdAt, deployedAt, tokenName, tokenSymbol,
tokenAddress, status, chainName, chainId, legalCompanyName, decimals,
initialTokenPrice and currentTokenPrice. `sortOrder` accepts asc/desc; defaults
are createdAt/desc. Prices sort numerically. Sorting happens before pagination,
with tokenUid as a stable tie breaker. Invalid values return 422. Holder summary
counts support `sortBy=currentHolders`. This mode checks all matching tokens and
sorts their verified currentHolders counts before pagination. Unknown balances
remain separately reported; the currentHolders count includes only verified
positive balances, so incomplete snapshots may undercount actual holders.
Example: `/api/v1/admin/tokens?page=1&limit=20&sortBy=tokenName&sortOrder=asc`.

The list checks at most three tokens concurrently and stops starting fresh balance
reads after 15 seconds. Tokens remaining after that budget report their historical
investors as unknown. In-flight checks can take up to another 15 seconds. Open
the token-details endpoint for a dedicated check of an individual token.

Use the existing admin-only endpoint:

`GET /api/v1/admin/tokens/:tokenUid?page=1&limit=20&search=&holderStatus=all`

Existing token fields, investor details, ordering, authorization and
`meta.pagination` shape remain unchanged. No new endpoint or migration is needed.
The token ABI used by the backend supports ERC-20 `balanceOf(address)` and
`decimals()`. These are read-only calls: no signature or gas payment is required.
An incompatible deployed contract is reported as UNKNOWN, not assumed compatible.

## Investor fields

```json
{
  "walletAddress": "0x...",
  "currentTokenBalance": "150.0",
  "currentTokenBalanceRaw": "150000000000000000000",
  "isCurrentHolder": true,
  "holderStatus": "CURRENT",
  "balanceBlockNumber": 123456,
  "balanceBlockHash": "0x...",
  "balanceVerifiedAt": "2026-10-20T10:00:00.000Z"
}
```

Balances are decimal strings formatted with the contract's decimals. They are
not padded to two places. Format for display without converting to JavaScript
Number. Raw values are strings too.

- CURRENT: raw balance > 0, `isCurrentHolder=true`.
- FORMER: verified raw balance = 0, `isCurrentHolder=false`.
- UNKNOWN: cannot verify; balance, raw balance, boolean, block and time are null.

These are `balanceOf` holdings, not necessarily transferable/unfrozen balances.

## Filtering and counts

`holderStatus` accepts `all` (default), `current`, or `former`.
Filtering happens before pagination, never only on the displayed page.
UNKNOWN is included only in `all`.

`data.holderSummary` contains:

```json
{
  "totalInvestors": 100,
  "currentHolders": 65,
  "formerHolders": 30,
  "unknownHolders": 5
}
```

The summary covers all historical investors matching `search`, across all pages,
before applying `holderStatus`. The three status counts sum to totalInvestors.
`meta.pagination.total` counts the holder-filtered result.
Historical eligibility still requires the existing confirmed investment/legacy
completed purchase criteria. Transfer-only recipients are not added.

## Read strategy and limitations

- Reads use the token's chain and deployed token address, not the UI network.
- Each snapshot pins decimals and balances to one latest block and checks that
  block's hash again before returning results.
- Wallets are deduplicated; JSON-RPC batching is capped at three and only three
  reads run concurrently (no unconfigured multicall contract is assumed).
- Internal fallback RPCs are tried on network/snapshot failure; wrong-chain RPCs
  are rejected. A completely failing batch stops further fan-out.
- Five-second read timeouts and a 15-second RPC budget bound work. Unchecked or
  failed wallets remain UNKNOWN. Partial results remain useful.
- Snapshots are cached for 30 seconds per chain/token/wallet set, with concurrent
  identical requests coalesced. Cache is bounded and process-local; separate
  backend instances may perform their own reads.
- This is a recent balance snapshot, not a permanently finalized balance.
  The next refresh rechecks state; balances can change after the reported block.
- Exact summaries require reading all matching investors on cache misses.
  For very large cohorts, some may be UNKNOWN within the budget. A persistent
  balance index would be a separate scaling enhancement.

Frontend: add balance/status columns and a holderStatus selector; reset to page
1 when search/filter changes. Show UNKNOWN as “Unavailable”, not 0. Display
balanceVerifiedAt/block as freshness information. Keep existing detail fields.
