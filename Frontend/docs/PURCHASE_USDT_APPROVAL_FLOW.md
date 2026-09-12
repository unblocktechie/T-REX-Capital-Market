# Purchase USDT Approval Flow

The investor purchase flow now separates USDT spending approval from the token purchase transaction.

## Step 1 — Allow USDT Spending

- Reads the current USDT allowance directly from the payment-token contract.
- If the platform's persistent maximum allowance is already active, the step is shown as completed after refresh and no approval transaction is requested.
- If approval is required, **Allow USDT Spending** submits only `USDT.approve(PlatformController, MAX_UINT256)` and waits for a successful receipt.
- No purchase intent or token purchase is submitted from this action.

## Step 2 — Confirm Purchase

- The Purchase CTA is enabled only after Step 1 is confirmed on-chain.
- `submitPlatformPurchase` no longer performs an approval transaction automatically.
- It checks that the existing allowance covers the quoted USDT amount, then submits only `PlatformController.buy(...)`.
- If the allowance was revoked or is no longer sufficient, the purchase is stopped before broadcast and the UI returns to Step 1.

## Refresh and repeated purchases

The page re-reads allowance from the USDT contract. The app grants `MAX_UINT256`; a persistent approval remains recognized across refreshes and future purchases. A new approval is only requested if the permission is absent/revoked/no longer sufficient.

## Responsive UX

The Order Summary keeps the existing desktop layout and adds two compact step cards. At narrower widths the existing purchase layout stacks, while the step headings/statuses and info popovers reflow for touch-sized mobile controls.
