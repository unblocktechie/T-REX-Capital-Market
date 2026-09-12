# Investment Journey UX

This update keeps the existing investment APIs, backend status values, routes, approval actions, wallet checks, and transaction flow intact. The changes are presentation and guidance changes so investors and issuers can understand the same process without needing to know internal status names.

## Shared 5-step journey

1. **Application** — the investor provides the required application information.
2. **Issuer review** / **Your review** — the issuer reviews the application.
3. **Your verification** / **Investor verification** — the investor completes the required checks.
4. **Final approval** — the issuer completes the final access approval; the platform may need time to confirm it.
5. **Ready to invest** — investment access is enabled.

Every journey card answers four questions in this order:

- **Where am I?** — a simple status such as `Waiting for issuer` or `Action needed from you`.
- **What is happening?** — one short sentence describing the current step.
- **Who acts next?** — `You`, `Investor`, `Issuer`, `Platform`, or `Complete`.
- **What happens next?** — a short next-step sentence.

## Investor screens

### My Applications

**Problem:** Raw request statuses do not explain whether the investor needs to act or wait.

**Updated UX:** Each row now shows `Where you are`, `What happens now`, and `Next action`. The primary action is `View Progress`.

### Application Details

**Problem:** Application information and activity history did not provide a clear full-process view.

**Updated UX:** A 5-step journey tracker appears before the application summary. When relevant, the journey card shows the primary action: `Complete Verification`, `Upload Requested Documents`, or `Invest Now`.

### Complete Verification

**Problem:** Verification/claim terminology and processing states could make the investor unsure whether another action was required.

**Updated UX:** The full journey remains visible. Common checks use plain labels such as `Identity check`, `Investor eligibility check`, and `Country eligibility check`. Processing states explicitly say when nothing is needed from the investor.

### Make an Investment

**Problem:** The purchase screen looked like a separate technical flow rather than the final part of the application journey.

**Updated UX:** The same journey tracker shows all five steps complete and `Ready to invest`, then the existing purchase flow continues unchanged.

## Issuer screens

### Investment Requests

**Problem:** A status filter such as `claimSubmitted` or `verifiedByIssuer` did not tell an issuer which requests actually needed their attention.

**Updated UX:** Existing backend filters are preserved but shown with business-friendly labels such as `Needs My Review`, `Needs Final Approval`, and `Waiting for Investor`. Each table row shows `Where it is` and `Who acts next`.

### Request Progress

**Problem:** The issuer detail screen mixed application review, verification, registry, and wallet concepts without first explaining the business state.

**Updated UX:** A shared 5-step journey appears first. The existing review and final-approval controls remain in place, but surrounding copy now explains whether the issuer should review, wait for the investor, complete final approval, wait for platform confirmation, or invite the investor to invest.

## Friendly status mapping

| Internal process state | Investor sees | Issuer sees | Next owner |
| --- | --- | --- | --- |
| Application still incomplete | Action needed from you | Waiting for investor | Investor |
| Application submitted | Waiting for issuer | Action needed from you | Issuer |
| Issuer review complete | Action needed from you | Waiting for investor | Investor |
| Investor verification submitted | Waiting for issuer | Action needed from you | Issuer |
| Final approval submitted and confirming | In progress | In progress | Platform |
| Final access confirmed | Ready to invest | Completed | Investor / Complete |
| Updated documents requested | Action needed from you | Waiting for investor | Investor |
| Terminal rejection | Needs attention | Needs attention | No action required |

The exact backend status values are not renamed or changed; this mapping is only used to create clearer user-facing guidance.

## Responsive behavior

- Desktop keeps the existing card/table visual language and shows all five journey stages horizontally.
- Tablet allows the journey stages to remain readable without compressing labels.
- Mobile turns the journey into a vertical step timeline, stacks action controls, and relies on the existing responsive data-table card behavior.
- No fixed widths were added to forms or primary page layouts.
