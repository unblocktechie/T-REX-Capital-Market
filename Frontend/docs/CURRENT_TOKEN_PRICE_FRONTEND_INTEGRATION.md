# Current Token Price Frontend Integration

## Issuer price management

The deployed/created token detail page now treats `initialTokenPrice` as the immutable launch price and `currentTokenPrice` as the editable trading price.

Price updates use:

```http
PATCH /api/v1/tokens/me/price
Content-Type: application/json
```

with exactly one field:

```json
{ "currentTokenPrice": 1.25 }
```

The editor validates a positive decimal with no more than 18 decimal places, previews the increase/decrease against the current price, never sends `initialTokenPrice`, and replaces the cached issuer token with the successful API response.

## Investor pricing

Marketplace/application token mapping now keeps both price concepts:

- `initialTokenPrice` / `initialTokenPriceExact`: fixed launch price.
- `currentTokenPrice` / `currentTokenPriceExact` / `price`: current trading price.

Portfolio current value and performance use the current price. Purchase, redemption, and transfer screens also use current price for a new operation. Once an operation has an API-created intent, a returned transaction-specific price snapshot (`tokenPriceSnapshot`, `tokenPrice`, `currentTokenPrice`, or `pricePerToken`) takes precedence so an existing operation is not repriced by a later issuer update.

The frontend does not add a price to purchase, redemption, or transfer intent payloads; those flows remain server-authoritative and continue to use their existing API contracts.
