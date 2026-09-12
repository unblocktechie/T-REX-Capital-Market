# Issuer Investment Request — First-time User UX Update

## Scope

This update improves the issuer-side investment request details and investor-check approval experience without changing request status values, API calls, wallet signing, claim payloads, registry logic, or backend behavior.

## Request details page

- Removed the duplicate in-page `Investment Requests > Request Progress` breadcrumb. The application-level breadcrumb remains available for navigation.
- Fixed the top application header on `/app/investors/:id` so it uses the Investment Requests page context instead of falling back to Dashboard.
- Renamed the page to **Investment request** and made the purpose explicit.
- Changed **Your progress** to **Request progress** for issuer users and changed **Next action** to **Who acts next**.
- Simplified the journey wording from **Investor verification** to **Investor checks**.
- Renamed summary fields to business-friendly terms such as **Request reference**, **Current status**, and **Changes submitted**.
- Added a clear **Your action** area before the issuer decision buttons.
- Renamed the decision CTAs to **Approve & Continue** and **Request changes or decline**.
- Renamed **Updates & documents** to **Application details & documents** and clarified that this information should be reviewed before deciding.

## Approval modal

- Renamed **Approve Investor Verification** to **Approve investor checks**.
- Replaced KYC/internal labels in the main UI with simple names such as **Identity check** and **Investment eligibility**.
- Added a short **What happens when you continue** explanation.
- Clearly states that wallet confirmations do **not move money**.
- Renamed the wallet section to **Approved organization account** and uses **Ready / Switch account** states.
- Replaced technical requirement badges with collapsed **Technical details** disclosures.
- Simplified signing, processing, failure, and success messages so the issuer always knows whether to act or wait.
- Increased important helper/body text sizes for readability.

## Request changes / decline modal

- Presents a clear choice between **Request updated documents** and **Decline this request**.
- Uses a **Message to investor** field with context-specific helper copy.
- Uses friendly investor-check names instead of claim/KYC terminology where possible.

## Responsive behavior

- The issuer action panel stacks below the request summary on narrower screens.
- Decision CTAs use two columns on tablet and one column on small mobile screens.
- Approval modal helper content, wallet status, check list, and footer remain readable and touch-friendly on mobile.
