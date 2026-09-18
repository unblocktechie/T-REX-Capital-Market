# Wallet integration

The organization and investor flows use Privy embedded wallets and are restricted to the **configured Arc network**. The UI calls the network simply **Arc**; Testnet versus Mainnet is selected through configuration.

## Runtime flow

1. The application creates one generic Arc chain definition from `VITE_ARC_*` values.
2. Privy receives that configured Arc chain as the default transaction-critical chain.
3. If an embedded wallet reports a different chain ID, the existing UI requests a switch to the configured Arc chain before any on-chain write.
4. Existing account, authorization, transaction, and receipt-validation flows are unchanged.
5. Public reads, simulations, and receipt polling use `VITE_ARC_RPC_URL`; signed writes continue through the authenticated Privy wallet provider.
6. Explorer links use `VITE_ARC_EXPLORER_URL`.

## Testnet / Mainnet selection

Use `.env.testnet.example` for Testnet or `.env.mainnet.example` for Mainnet. The complete variable list and switching instructions are in `docs/ARC_NETWORK_CONFIGURATION.md`.

The same source code is used for both environments. No component, service, wallet flow, or transaction implementation branches on Testnet versus Mainnet.

## Backend alignment

The existing organization submission API contract is unchanged. Any backend service that persists wallet/network metadata, validates chain IDs, verifies transaction receipts, or builds explorer links must use values that match the frontend profile being built.
