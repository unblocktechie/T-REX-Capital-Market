# Frontend wallet-direct transaction integration

## Architecture

Invest, Send, and the final Redemption transaction are now wallet-to-contract operations. The frontend no longer creates backend purchase/transfer intents, consumes backend-prepared transfer calldata, or calls legacy purchase/transfer confirm/retry APIs.

- Wallet transaction execution: user wallet -> Platform Controller / token contract -> blockchain.
- Fast synchronization: after the wallet returns a hash, the frontend stores it locally and calls `POST /investments/transactions/confirm`.
- Recovery: backend/API failure never causes a second wallet transaction. Locally observed hashes are retried only for synchronization and are removed after canonical history reports `CONFIRMED` or `FAILED`.
- History: new Invest/Transfer history and issuer Transaction History use `GET /investments/transactions`.
- Export: issuer Transaction History uses `GET /investments/transactions/export`; browser-side blockchain log scanning and page-only export generation were removed.

## Invest

1. Read Platform Controller quote on-chain.
2. Read investor USDT allowance on-chain.
3. If needed, investor signs a separate reusable USDT approval.
4. Investor directly signs `PlatformController.buy(token, amount)`.
5. Store the returned hash before calling the backend.
6. Call canonical transaction confirmation with `expectedAction: INVEST`.
7. `SUBMITTED` is synchronization-only and never triggers another wallet transaction.

Legacy purchase create/confirm/retry frontend calls were removed. Legacy purchase GET methods remain available in the API layer only for historical migration/read compatibility.

## Send

1. Validate the connected registered wallet, recipient, and amount in the UI.
2. Simulate `token.transfer(recipient, amount)` against the token contract.
3. Investor directly signs the simulated transfer.
4. Store the hash locally and call canonical confirmation with `expectedAction: TRANSFER`.
5. Refresh canonical transaction history.

Backend-prepared `transactionRequest`, transfer create, transfer confirm, and transfer retry calls were removed.

## Redemption

The off-chain request/authorization/issuer decision APIs remain. Issuer USDT allowance remains a separate direct wallet approval. When ready, the investor directly signs `PlatformController.redeem(token, amount)`.

The returned redemption hash is stored in the generic observed-wallet transaction store, then canonical confirmation is called with `expectedAction: REDEMPTION`. The legacy redemption request is refreshed after canonical confirmation. No backend issuer payment confirmation call is used.

## Canonical transaction API

- `POST /investments/transactions/confirm`
- `GET /investments/transactions`
- `GET /investments/transactions/export`

Client-provided transaction amounts, recipients, token addresses, prices, and status are not sent to the confirm endpoint. Only `chainId`, `txHash`, `tokenUid`, and `expectedAction` are sent so the backend can independently verify the chain transaction.

## Duplicate prevention and refresh recovery

`observedWalletTransactionStore.js` stores only the minimum information necessary to resume synchronization: chain, hash, token UID, action, and optional application/redemption references. Invest, Send, and Redeem check this local observation on reload/focus. A delayed backend or indexer never causes automatic resubmission of the wallet transaction.
