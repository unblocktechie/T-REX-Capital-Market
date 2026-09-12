# Frontend Token Redemption Guide

## Responsibility split

- Investor creates the off-chain redemption request and completes the existing authorization step.
- Issuer reviews the request, maintains USDT allowance, and signs the final `redeem()` transaction.
- Platform Controller atomically burns Investor tokens and transfers Issuer USDT to the Investor.
- Backend verifies/indexes the transaction and updates history; it never executes settlement.

## Investor flow

1. Call `POST /api/v1/investments/tokens/:tokenUid/redemptions` with `tokenAmount` and a unique
   `idempotencyKey`.
2. Persist `redemptionUid` and complete the existing EIP-712 authorization through
   `POST /api/v1/investments/redemptions/:redemptionUid/authorize`.
3. Show `PENDING_ISSUER_APPROVAL` and refresh the Investor detail/history endpoint.
4. The Investor does not approve USDT and does not sign the final redemption transaction.
5. When the backend/indexer changes the request to `COMPLETED`, show the canonical redemption hash
   and updated balance/history.

## Issuer flow

1. Load `GET /api/v1/investments/issuer/redemptions` and open the request detail.
2. Approve or reject using the existing Issuer review APIs.
3. For an approved request, require the connected wallet to match the Issuer organization wallet.
4. Read `USDT.allowance(issuerWallet, controllerAddress)` directly on-chain.
5. If allowance is insufficient, call `USDT.approve(controllerAddress, MaxUint256)` from the Issuer
   wallet, wait for mining, and re-read allowance. Do not approve again while allowance is sufficient.
6. Optionally read the Issuer's USDT balance for early UX feedback.
7. Call the Controller from the Issuer wallet:

```solidity
redeem(
  redemption.investorWalletAddress,
  redemption.tokenAddress,
  redemption.tokenAmountRaw
)
```

8. Save the returned hash locally immediately.
9. Call the backend fast-path using the Issuer access token:

```http
POST /api/v1/investments/transactions/confirm
Authorization: Bearer <issuerAccessToken>
Content-Type: application/json
```

```json
{
  "chainId": 5042002,
  "txHash": "0x...",
  "tokenUid": "<tokenUid>",
  "expectedAction": "REDEMPTION"
}
```

10. `SUBMITTED` means wait for the configured confirmations and refresh history; do not open
    MetaMask again. `CONFIRMED` means the canonical history and matching redemption request were
    updated. A definitive 4xx mismatch must be shown as an error and must never be treated as success.

## What the backend proves

The frontend sends no wallet, amount, recipient, controller, or price to the confirmation API. The
backend derives those values from calldata/events and verifies:

- the JWT is the token-owning Issuer;
- `tx.from` is the stored organization wallet;
- delegated execution is through an allowlisted manager;
- the effective target is the Controller stored for the token;
- calldata is exactly `redeem(investor, token, tokenAmount)`;
- successful canonical receipt and required confirmations;
- exact `TokensRedeemed` event;
- exact token burn and Issuer-to-Investor USDT transfer;
- exact Controller token configuration and redemption quote.

## Refresh and recovery

The confirm call accelerates UI synchronization but is not required for blockchain execution. If the
browser closes or the API is unavailable after signing, the global indexer discovers the confirmed
token burn from its checkpoint and runs the same verifier. On reload, query:

```http
GET /api/v1/investments/transactions?type=REDEMPTION&tokenUid=<tokenUid>
GET /api/v1/investments/issuer/redemptions/<redemptionUid>
```

Never retry by sending another blockchain transaction merely because backend status is delayed.
