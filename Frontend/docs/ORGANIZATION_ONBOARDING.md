# Organization Onboarding

## Routes

- `/app/organization` – status-aware entry route
- `/app/organization/company-information`
- `/app/organization/jurisdiction`
- `/app/organization/ubo`
- `/app/organization/documents`
- `/app/organization/review`
- `/app/organization/pending`
- `/app/organization/verified`
- `/app/organization/overview`

## Persistence

Organization form data, UBO records, documents, progress, and submission status are loaded from and saved to the authenticated backend. Browser IndexedDB and the legacy local organization store are no longer used by the active onboarding flow.

The browser stores only non-authoritative UI metadata:

- final-review confirmation checkbox state
- whether the one-time approved success screen has already been viewed

## UBO ownership validation

- Every UBO ownership percentage must be greater than `1.00%` and can contain at most two decimal places.
- The combined ownership across all UBOs must equal exactly `100.00%`; validation uses integer basis points rather than floating-point tolerance.
- The final review revalidates these rules and blocks submission if older saved data does not comply.

## Status flow

`NOT_STARTED → DRAFT → SUBMITTED/UNDER_REVIEW → APPROVED`

- Submitted and under-review records are locked and open the pending page.
- Approved records show the verified success screen once.
- Later Organization visits open the read-only verified overview.
- Rejected records return to the editable onboarding flow; backend rules remain authoritative.

See `ORGANIZATION_BACKEND_INTEGRATION.md` for endpoint, payload, security, and testing details.
