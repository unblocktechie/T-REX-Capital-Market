# Redemption one-time USDT setup UX

## Goal

The issuer grants the Platform Controller a reusable maximum USDT allowance only when the live on-chain allowance is insufficient. Once the allowance is sufficient, redemption request screens no longer show an approval stage, approval-complete banner, approval explanation, or approval status.

## Issuer flow

Normal requests after the reusable allowance exists show only:

1. Review request
2. Investor redeems
3. Redemption completed

The page still reads the live issuer allowance and USDT balance from the blockchain. The one-time setup UI is rendered only when the current allowance is actually insufficient. After a successful maximum approval, the funding state is refreshed and the setup step disappears immediately.

If issuer USDT balance is insufficient, the UI asks the issuer only to add the required funds; it does not repeat approval messaging.

## Investor flow

The investor never needs to understand the issuer allowance mechanism. While settlement is not ready, the investor sees a simple waiting message such as "The issuer is preparing this redemption." Once both live allowance and balance are ready, the Redeem action becomes available.

## Functionality preserved

- Redemption request creation and investor authorization
- Issuer approve/reject business workflow
- Live on-chain allowance and balance checks
- Maximum allowance transaction for first-time setup
- Investor-signed `redeem()` transaction
- Canonical transaction confirmation/history synchronization
- Existing polling, wallet guards, and error handling
