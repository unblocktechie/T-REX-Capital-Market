# First-time user screen UX update

This update simplifies the read-only issuer and investor screens without changing API calls, routes, wallet behavior, token state, or blockchain actions.

## Removed cards

- Removed the token-detail footer card that said the core token configuration was locked.
- Removed the investor-profile footer card that described the protected investor record.

## Investment asset details

- Reframed the page around an **Investment asset** instead of leading with ERC-3643 terminology.
- Made the current investor price and investor availability the primary summary.
- Moved the contract address and blockchain-specific information into **View technical details**.
- Renamed technical sections to **Investor Access**, **Who Manages This Asset**, **Investor Checks**, and **Investment Limits**.
- Replaced numeric claim-topic names with business-friendly labels where common claim topics can be identified.
- Added short explanations to summary metrics and automatically reflects missing investor-access or management records as **Needs attention** instead of showing a false ready state.

## Issuer dashboard

- Aligned the page title with the sidebar by using **Dashboard** instead of **Overview**.
- Replaced token-heavy wording with investment-asset wording where it improves comprehension.
- Added a compact **Next** message to tell the issuer what to do after the current state.
- Changed the secondary action to **View investors** once an asset has been created.
- Simplified the setup, metric, empty-state, and action-center wording.
- Avoids claiming live investor access is ready from the dashboard alone; users are directed to the asset page for live settings.

## Organization overview

- Removed unexplained **KYB** from the verified organization heading.
- Renamed summary metrics using normal business language such as **Registered in**, **Company type**, **Company owners**, and **Issuer access**.
- Renamed **Master Organization Wallet** to **Approved Organization Wallet** and explains what the wallet is used for.
- Corrected the date label to **Verified on**.
- Moved the on-chain organization identity into a collapsed **View technical details** section.
- Renamed the ownership and document sections to **Company Owners** and **Verification Documents**.

## Responsive behavior

The existing responsive grid and card system is preserved. New content uses the same breakpoints and collapses from multi-column layouts to single-column layouts on smaller screens. Technical disclosures and management rows are keyboard accessible and reflow for touch-sized mobile layouts.
