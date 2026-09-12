# Repeatable wallet actions and responsive history

## Purpose

This update keeps Invest, Send, and Redeem protected from duplicate wallet submissions while a transaction is still `SUBMITTED`, but releases that local action lock as soon as the canonical backend verifier reports `CONFIRMED`, `FAILED`, or a definitive 4xx mismatch.

## Invest

- USDT approval and Invest now share one action area and one CTA.
- Before approval the CTA is **Approve**.
- After the allowance check reports sufficient approval, approval guidance is replaced by investment guidance and the same CTA becomes **Invest**.
- A submitted investment remains locked only while its canonical status is `SUBMITTED`.
- Canonical confirmation is polled using the observed transaction hash, independent of visible history filters.
- After `CONFIRMED`, the observed hash is cleared and another investment can be submitted immediately.
- Investor investment history now contains Date, Token amount, USDT amount, Status, and Payment only.

## Send

- The locally observed transfer hash prevents a second wallet submission only while confirmation is pending.
- Canonical confirmation is polled independently of the currently selected history filters.
- On `CONFIRMED`, the transfer composer is reset and the investor can enter a new recipient and amount immediately.
- On `FAILED`, or a definitive verifier mismatch, the stale local lock is removed so the user can correct the transfer and try again.
- Temporary backend/RPC synchronization failures do not resend a blockchain transaction.

## Redemption

- The off-chain redemption request and issuer decision are unchanged.
- Once the investor-signed `redeem()` transaction is observed, its hash is polled against the canonical verifier.
- On `CONFIRMED`, the current request is treated as completed locally, the observed hash is cleared, history refreshes, and a new redemption request can be started immediately even if a legacy detail refresh is briefly behind.
- On `FAILED` or a definitive verifier mismatch, the submitted-hash lock is released without automatically sending another wallet transaction.

## Issuer responsive UX

- The Redemption Requests refresh action uses compact sizing and moves below header copy where horizontal room is limited.
- Canonical Transaction History changes from a dense seven-column table into labeled transaction record cards at narrower issuer workspace widths, preventing clipped transaction values and activity icons.
- Desktop table behavior remains unchanged at wider widths.

## Safety rules preserved

- No transaction is automatically resubmitted because backend/indexer synchronization is delayed.
- Observed hashes remain the duplicate-submission guard while a transaction is genuinely pending.
- Canonical transaction history remains intact.
- Existing wallet signing, allowance checks, issuer approval workflows, transaction APIs, and blockchain execution logic are unchanged except for releasing completed/failed local action locks.
