# Multi-payment-token flow

## Source of configuration

Supported payment currencies are stored in `paymentTokenMaster`. Do not add separate
purchase/redemption address environment variables or hardcode a currency in application code.
Each row contains display metadata, chain, decimals, explorer URL, purchase/redemption support,
default selection, ordering, and active/deleted state.

Current Network currencies:

| Symbol | Contract address | Decimals |
| --- | --- | ---: |
| USDT | `0x86B14D29A59b745bF08c42661322d13142d5eb49` | 6 |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 6 |

Use `GET /api/v1/payment-tokens` for the frontend dropdown. The same list is also included in
`GET /api/v1/token-options`.

Both endpoints first load active rows for the configured chain from `paymentTokenMaster`, then call
`paymentTokens()` on the currently configured Platform Controller. They return only the address
intersection. A database row that has not been enabled in the Controller is never exposed. If the
Controller allowlist cannot be verified through the primary or fallback RPCs, the endpoint fails
closed with HTTP `503` and `PAYMENT_TOKEN_REGISTRY_UNAVAILABLE` instead of returning an
unverified database-only list.

## Token creation

The issuer selects one catalogue item and sends its `contractAddress` as `paymentTokenAddress` in
`PUT /api/v1/tokens/me/information`. The backend rejects unknown/inactive addresses and stores the
normalized address on `tokenMaster`. All later purchase and redemption calls for that security
token must use this stored payment token.

Existing tokens are migrated to the original USDT address and keep their existing Platform
Controller/Token Agent. New tokens use the currently configured Platform Controller.

## Frontend contract calls

Purchase:

```solidity
buy(tokenAddress, paymentTokenAddress, tokenAmountRaw)
```

The investor checks and, if necessary, approves allowance on `paymentTokenAddress` for the token's
stored Controller.

Redemption:

```solidity
redeem(investorWalletAddress, tokenAddress, paymentTokenAddress, tokenAmountRaw)
```

The issuer checks and, if necessary, approves allowance on `paymentTokenAddress` for the token's
stored Controller.

After either transaction is broadcast, call `POST /api/v1/investments/transactions/confirm` with
only the usual chain/hash/token/action context. Never submit payment amounts or payment addresses as
authoritative confirmation data.

## Backend verification and recovery

The verifier decodes the payment token from the new Controller calldata and requires it to match:

1. `tokenMaster.paymentTokenAddress`;
2. an active entry in the backend catalogue;
3. `PlatformController.isPaymentToken(paymentTokenAddress)` at the receipt block;
4. the payment-token `Transfer` event;
5. `TokensPurchased` or `TokensRedeemed` event data; and
6. the matching multi-payment `quoteBuy` or `quoteRedeem` result.

Canonical history stores generic `paymentToken*` and `paymentAmount*` fields. The older `usdt*`
fields remain populated as compatibility aliases and are not used to choose the currency.

The checkpointed indexer loads and scans all active database payment-token addresses plus deployed token transfer
events. It calls the same verifier as the fast confirmation API, so missed frontend confirmations
are recovered idempotently. Existing legacy Controller signatures remain supported for already
deployed tokens.

## Deployment

Apply `database/migrations/20260908_add_multi_payment_tokens.sql` after the canonical blockchain
transaction migration, then apply `database/migrations/20260915_move_payment_tokens_to_database.sql`.
The latter creates and seeds `paymentTokenMaster`. Back up production first. Both migrations are
additive and existing token selections/history remain unchanged.

To add a currency later, insert it into `paymentTokenMaster`, enable the applicable
`supportsPurchase`/`supportsRedemption` flags, and add it to the Platform Controller's on-chain
payment-token list. Both conditions are required before it appears in the API. Set only one active
default row per chain. No backend code deployment is required.
