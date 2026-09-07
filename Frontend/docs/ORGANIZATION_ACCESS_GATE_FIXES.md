# Organization onboarding access gate

## Changes

- Tax ID / VAT / GST is optional and has no frontend validation.
- Empty optional jurisdiction fields are omitted from the backend request.
- Issuer accounts remain inside the organization onboarding flow until the backend reports:
  - organization status `approved`, and
  - `isNotified` / `isUserNotified` equal to `1` or `true`.
- Locked issuers cannot open dashboard, token, compliance, investor, report, profile, settings, or other application routes.
- The locked shell displays only the T-REX logo, signed-in user summary, and logout action.
- Admin, investor, manager, and member workspaces keep their existing navigation.
- The one-time organization verified page stays in the minimal shell; its dashboard action opens the full workspace after notification acknowledgement.
