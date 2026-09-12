# Issuer Transaction History

## Purpose

The issuer workspace now includes **Transaction History** at `/app/transactions`.
It gives an issuer a read-only view of confirmed movements for the issuer's created token.

## Data source

The page reads the token contract's standard `Transfer` events directly from the configured network RPC. This keeps the history aligned with confirmed on-chain token movements and does not depend on optimistic UI state.

Activity is presented in business-friendly groups:

- **Tokens issued** — a transfer from the zero address.
- **Sent by issuer** — tokens sent from a known issuer/treasury/management wallet.
- **Received by issuer** — tokens received by a known issuer/treasury/management wallet.
- **Investor transfer** — tokens moved between non-issuer wallets.
- **Tokens redeemed** — a transfer to the zero address.

Only confirmed logs are shown as **Confirmed**.

## UX

- Search by wallet address or transaction ID.
- Filter by activity type and date range.
- Client-side pagination keeps the table manageable.
- **Export Excel** exports the currently filtered history as an `.xls` workbook without adding a new runtime dependency.
- **Refresh** re-reads the latest confirmed activity from the network.
- Transaction IDs link to the configured block explorer.
- Desktop uses a normal data table; small screens use the application's existing responsive table-card pattern.

## Existing functionality

No token transfer, investment, redemption, wallet-signing, or backend write behavior is changed. The new feature is issuer-only and read-only.
