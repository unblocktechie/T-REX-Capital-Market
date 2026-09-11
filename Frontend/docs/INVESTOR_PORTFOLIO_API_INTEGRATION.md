# Investor Portfolio API Integration

The investor Portfolio page now uses `GET /api/v1/investments/me/portfolio` as its source of truth.

- Requests use server pagination (`page`, `limit=20`) and debounced `search`.
- Each returned top-level token is mapped with its token/issuer/network/compliance details.
- The nested `portfolio` object drives purchased, invested, redeemed, net holding, average purchase price, transaction counts, and activity dates.
- Pending, failed, and expired purchase amounts are not inferred or added by the frontend.
- Token images use the returned authenticated relative `imageUrl` through the authenticated API client.
- Token details navigation uses `tokenUid`.
- Asset Management accepts a `tokenUid` query parameter and resolves it to the existing registered application without changing the existing `interestUid` flow.
- When a purchase or redemption reaches `COMPLETED`, the Portfolio endpoint is refreshed in the background.
