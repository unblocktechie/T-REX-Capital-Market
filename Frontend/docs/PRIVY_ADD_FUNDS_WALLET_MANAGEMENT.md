# Privy Add Funds — Wallet Management

## Purpose

Wallet Management includes an **Add funds** action for the currently authenticated Privy secure account. The action opens Privy's `useAddFunds` flow. Funding is intentionally directed to **Ethereum Mainnet USDC**, while the rest of the T-REX application continues to use its existing Arc Testnet configuration.

## Destination

The destination is defined once in shared Web3 configuration and consumed by Wallet Management:

- wallet: the current Privy secure account address from `useWalletConnection()`;
- chain: Ethereum Mainnet in CAIP-2 form, `eip155:1`;
- asset: Circle's official Ethereum Mainnet USDC contract, `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`.

The Ethereum Mainnet funding configuration is deliberately separate from `requiredChain`, so this change does not alter Arc token creation, investment, redemption, transfer, wallet-balance, or deployment behavior.

## Privy funding options

The page calls `useAddFunds()` with both funding modes enabled:

- fiat source: USD, default USD, production provider environment;
- crypto deposits: 100 bps maximum slippage.

Providing both methods allows Privy to present whichever configured funding methods are available for the application and destination.

## UX and safety

- The button is disabled until a valid Privy wallet address and valid destination USDC address are available.
- Repeated clicks are prevented while a funding flow is opening/running.
- User cancellation is treated as a non-error and does not claim that funds were added.
- Fiat `submitted`, fiat `confirmed`, and crypto `completed` results receive distinct user feedback.
- Funding-success messages explicitly identify Ethereum Mainnet so users are not led to believe their Arc Testnet balance changed.
- Existing Wallet Management responsiveness and all existing Arc asset/balance behavior are unchanged.

## Privy dashboard requirement

Privy funding methods must be enabled/configured for the application in the Privy Dashboard. Provider/route availability is controlled by Privy and its funding providers; the frontend surfaces provider errors without changing existing wallet or transaction behavior.
