# USDT Approval, Invest, and Redemption Flow

## Final ownership/signing rule

| Action | USDT direction | USDT owner that approves Platform Controller | Action transaction signer |
| --- | --- | --- | --- |
| Invest / Buy | Investor -> Issuer | Investor | Investor |
| Redemption | Issuer -> Investor | Issuer | Investor |

Approval and action signing are intentionally separate blockchain transactions.

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
2. After issuer review, read the issuer organization's live USDT allowance and balance.
3. If allowance is insufficient, the issuer signs a standalone `approve(controller, MAX_UINT256)` transaction.
4. Wait for the approval receipt and re-read the issuer allowance on-chain.
5. The issuer does not sign an ERC-20 payment transfer and does not sign `redeem()`.
6. When issuer allowance and balance are sufficient, the investor sees **Redeem**.
7. The investor signs the Platform Controller `redeem(...)` transaction from the registered investor wallet.
8. The contract handles token redemption and USDT settlement atomically for that investor.

## Safety behavior

- Allowances are read from the USDT contract; page refresh does not rely on a local "approved" flag.
- A new approval is requested only when live allowance is insufficient.
- New approvals use `MAX_UINT256` so the approved owner normally completes approval once.
- Approval success is not assumed until the transaction receipt succeeds and allowance is re-read.
- Invest re-checks investor USDT balance and allowance immediately before submission.
- Redeem re-checks issuer USDT balance and allowance immediately before submission.
- The connected signer is checked against the registered investor wallet for Invest and Redeem.
- The connected signer is checked against the issuer organization wallet only for redemption funding approval.
- Legacy direct issuer-signed redemption payment submission is disabled defensively.
