# Organization Backend Integration

The organization onboarding flow now uses the authenticated T-REX backend instead of browser-local organization records.

## API configuration

```env
VITE_API_BASE_URL=http://192.168.29.90:3000/api
VITE_API_VERSION=v1
```

For production, use an HTTPS API URL and allow the deployed frontend origin through backend CORS.

## Integrated endpoints

- `GET /organization-options`
- `GET /locations/countries`
- `GET /locations/countries/:countryUid/states`
- `GET /locations/states/:stateUid/cities`
- `GET /organizations/me`
- `PUT /organizations/me/company-information`
- `PUT /organizations/me/jurisdiction`
- `PUT /organizations/me/beneficial-owners`
- `POST /organizations/me/documents`
- `GET /organizations/me/documents`
- `GET /organizations/me/documents/:documentUid/download`
- `DELETE /organizations/me/documents/:documentUid`
- `POST /organizations/me/submit`

## Security behavior

- Organization routes are available only to authenticated Issuer accounts.
- The existing Axios interceptor attaches the JWT as a Bearer token.
- A `401` response clears the session and redirects to login.
- A `403` response prevents access to the onboarding flow.
- Multipart uploads let the browser generate the boundary; the frontend never hardcodes multipart `Content-Type`.
- Buttons are disabled while mutations are running to prevent duplicate saves, uploads, deletes, and submissions.
- Uploaded files are no longer stored in IndexedDB. Preview and download requests are authenticated backend requests.
- The frontend treats every successful mutation response as the latest source of truth.

## Form behavior

- Draft and Save for Later buttons are intentionally removed from the onboarding screens.
- Continue sends `isDraft: false` and waits for backend success before moving to the next step.
- Back buttons and clicks on previously reached step indicators navigate without sending the incomplete current form to the backend.
- Backend validation details are mapped to React Hook Form fields.
- Country changes clear state and city; state changes clear city.
- Entity types, industries, document types, countries, states, and cities use backend UIDs as values.
- The UBO endpoint receives the complete current owner array, with the first owner marked primary.
- Required document types are checked using `organization-options` before final review.
- Submitted, under-review, and approved organizations are read-only.

## Backend contract note

The supplied backend contract requires `postalCode` when Company Information is completed. The field is therefore included in the company form and payload. If postal code must remain absent from the product UI, the backend validation and DTO must first be changed to make `postalCode` optional.

## Verification status

Backend statuses are mapped to the current frontend experience:

- `draft` or `rejected` → editable draft
- `submitted` or `underReview` → verification pending/read-only
- `approved` → one-time verified success screen, followed by the read-only overview

Only the one-time verified-screen viewed flag and review confirmation checkboxes remain as local UI metadata; organization data and documents remain backend-owned.

## Organization wallet submission

Final organization submission now requires a connected wallet on the configured network. The frontend sends:

```json
{
  "walletAddress": "0x..."
}
```

The backend must validate and persist `walletAddress`, include it in the submit response and return it from `GET /organizations/me`. See `WALLET_INTEGRATION.md` for the complete network, UI, and backend contract.
