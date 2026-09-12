# Investor first-time UX refresh

This update keeps the existing routes, APIs, wallet guards, investment transactions, USDT approval flow, transfer flow, redemption flow, and backend status handling intact. The changes are limited to presentation, information hierarchy, progressive disclosure, labels, helper text, and responsive styling.

## Screens updated

### Investor dashboard
- Makes the next action the primary message.
- Uses business-friendly labels such as Approved investments and Available investments.
- Replaces the blockchain-heavy identity summary with an Account setup summary.
- Keeps blockchain identity information available under Technical details.

### Marketplace
- Renames the main heading to Explore investments.
- Simplifies filters and card metrics.
- Removes the token standard from the primary card view.
- Uses Price per unit, Maximum you can hold, Issuer country, and Investor limit.

### Investment details
- Fixes the top application header so marketplace detail routes show Investment Details instead of Dashboard.
- Moves token standard, decimals, blockchain identity, and registry addresses into collapsed Technical details.
- Changes KYC-style labels to Identity verification and accredited-investor language to Investment eligibility check.
- Uses plain-language limits and status messaging.

### Manage Investments
- Renames Manage Tokens to Manage Investments without changing its route.
- Adds a short explanation for Invest more, Send, and Redeem.
- Keeps approved-investment selection and action tabs intact.

### Invest
- Hides wallet/contract addresses behind View wallet & payment details.
- Uses How many units would you like to buy? and an Estimated USDT cost summary.
- Clarifies one-time USDT spending approval and keeps it separate from Invest.
- Does not alter allowance checks or transaction-signing logic.

### Send
- Uses Who are you sending to? and Check recipient.
- Explains recipient eligibility and amount checks before wallet confirmation.
- Renames the side panel to Send summary and clarifies current holding/value information.

### Redeem
- Explains the issuer-review/payment-readiness sequence in plain language.
- Makes it clear when the investor should wait versus when Redeem is ready.
- Keeps the investor as the signer of the final redemption transaction.
- Moves blockchain network information behind Technical details.

### Investor profile
- Explains what the profile is used for and what the investor should do next.
- Keeps registered wallet and document counts prominent.
- Moves blockchain identity/network/balance information behind Technical wallet details.
- Rewords suitability/accreditation language into simpler investment-background and eligibility language.

## Responsive behavior
- New technical disclosures and guidance cards stack on smaller screens.
- Investment detail metrics collapse from four columns to two and then one.
- Profile purpose content and technical grids stack cleanly on tablets and phones.
- Existing desktop, tablet, and mobile breakpoints remain intact.
