# USDT Approval, Invest, and Redemption Flow

## Final ownership/signing rule

| Action | USDT direction | USDT owner that approves Platform Controller | Action transaction signer |
| --- | --- | --- | --- |
| Invest / Buy | Investor -> Issuer | Investor | Investor |
| Redemption | Issuer -> Investor | Issuer | Issuer |

Approval and action signing are intentionally separate blockchain transactions. The existing Invest flow is unchanged.

## Invest / Buy

1. Read the investor's live USDT allowance for the Platform Controller.
2. If the allowance already covers the current purchase, skip approval.
3. If it does not, the investor signs a standalone `approve(controller, MAX_UINT256)` transaction.
4. Wait for the approval receipt and re-read allowance on-chain.
5. Only after sufficient allowance is confirmed, enable **Invest**.
6. The investor signs the Platform Controller `buy(...)` transaction.
7. The issuer is never asked to approve or sign an individual investment.

## Redemption

1. The investor creates/authorizes the redemption request using the existing application flow.
2. The request appears in the issuer redemption queue for review.
3. After issuer approval, read the issuer organization's live USDT allowance and balance.
4. If allowance is insufficient, the issuer signs a standalone `approve(controller, MAX_UINT256)` transaction.
5. Wait for the approval receipt and re-read the issuer allowance on-chain.
6. Do not request approval again when the live allowance already covers the quoted redemption amount.
7. When issuer allowance and balance are sufficient, enable **Redeem** for the issuer.
8. The issuer signs `redeem(investor, token, tokenAmount)` from the organization wallet.
9. The contract burns the investor's tokens and transfers USDT directly from issuer to investor atomically.
10. The frontend does not submit a separate USDT transfer and does not custody redemption funds.
11. Mark the redemption completed only after the blockchain transaction confirms successfully, then synchronize canonical issuer and investor history.

## Safety behavior

- Allowances are read from the USDT contract; page refresh does not rely on a local "approved" flag.
- A new approval is requested only when live allowance is insufficient.
- New approvals use `MAX_UINT256` so the approved owner normally completes approval once.
- Approval success is not assumed until the transaction receipt succeeds and allowance is re-read.
- Invest re-checks investor USDT balance and allowance immediately before submission.
- Redeem re-checks issuer USDT balance and allowance immediately before submission.
- Invest continues to require the registered investor wallet exactly as before.
- Redemption approval and final `redeem()` both require the issuer organization wallet.
- The final redemption transaction passes the request investor address, token address, and token amount to the Platform Controller.
- Rejected wallet requests, failed/reverted transactions, wrong wallet/network, insufficient issuer balance, and insufficient issuer allowance leave the redemption incomplete.
