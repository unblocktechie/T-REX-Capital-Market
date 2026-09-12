# Redemption one-time USDT setup UX

## Goal

The issuer grants the Platform Controller a reusable maximum USDT allowance only when the live on-chain allowance is insufficient. Once the allowance is sufficient, redemption request screens no longer show an unnecessary approval step for later redemptions.

## Issuer flow

Normal requests after the reusable allowance exists show only:

1. Review request
2. Issuer redeems
3. Redemption completed

The page still reads the live issuer allowance and USDT balance from the blockchain. The one-time setup UI is rendered only when the current allowance is actually insufficient. After a successful maximum approval, the funding state is refreshed and the setup step disappears immediately.

If issuer USDT balance is insufficient, the UI asks the issuer only to add the required funds; it does not repeat approval messaging. When allowance and balance are both sufficient, the issuer can execute the final `redeem(investor, token, tokenAmount)` transaction from the organization wallet.

## Investor flow

The investor creates/confirms the redemption request using the existing request flow and then waits for issuer review and execution. The investor does not receive a final on-chain Redeem action and does not sign the final redemption transaction. Existing redemption status/history UI continues to update as the issuer transaction progresses and confirms.

## Functionality preserved

- Redemption request creation and investor authorization
- Issuer approve/reject business workflow
- Live on-chain issuer allowance and balance checks
- Maximum allowance transaction for first-time setup
- Issuer-signed final `redeem(investor, token, tokenAmount)` transaction
- Direct contract-managed USDT settlement from issuer to investor
- Canonical transaction confirmation/history synchronization
- Existing polling, wallet guards, status conventions, and error handling
- Existing Invest and Send flows remain unchanged
