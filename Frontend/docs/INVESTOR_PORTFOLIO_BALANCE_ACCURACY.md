# Investor Portfolio Balance Accuracy

The Portfolio screen deliberately separates live wallet state from platform transaction history.

## Live holdings

`portfolio.netTokenAmount` is not presented as the investor's current wallet balance. That value is a platform activity aggregate and can diverge from the blockchain balance when tokens are transferred directly, received from another wallet, or otherwise moved outside a purchase/redemption path.

For each token returned by `GET /api/v1/investments/me/portfolio`, the UI reads ERC-20/ERC-3643 `balanceOf(registeredInvestorWallet)` from the returned token contract and chain. A balance is displayed only when the token address, chain id, token decimals, registered wallet, and RPC read are all available. Otherwise the UI displays `Unavailable` rather than substituting a platform-derived amount.

## Values shown

- **Wallet balance**: live `balanceOf` for the registered investor wallet.
- **Estimated value**: verified live wallet balance multiplied by the issuer's latest `currentTokenPrice`.
- **Current price**: latest issuer-maintained current token price.
- **Initial price**: immutable launch price, shown only as reference.
- **Platform investment**: completed purchase value, average purchase price, and completed purchase count returned by the portfolio API.

Performance/gain-loss is intentionally omitted because direct transfers can change the live wallet balance without providing a reliable cost basis for those tokens.

The portfolio endpoint still determines which token rows appear: it returns tokens with at least one completed platform purchase. This UI does not claim that the endpoint's platform net amount is the blockchain wallet balance.
