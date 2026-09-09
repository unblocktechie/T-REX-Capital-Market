# Investor Backend Integration

The investor onboarding UI is integrated with the authenticated T-REX backend while retaining the existing visual structure and responsive styles.

## API mapping

- `GET /investor-options` — loads genders, identity/accreditation document types, source-of-wealth, net-worth, investment-capacity, investment-category, and accreditation options.
- `GET /locations/countries` — loads the Country of Residence dropdown from the shared location master.
- `GET /locations/countries/:countryUid/states` — loads State / Province after a country is selected.
- `GET /locations/states/:stateUid/cities` — loads City after a state/province is selected.
- `GET /investors/me` — restores the backend-authoritative onboarding state and uploaded document metadata.
- `PUT /investors/me/identity` — debounced partial drafts use `isDraft: true`; Continue uses `isDraft: false` and backend validation.
- `POST /investors/me/documents` — multipart upload with `documentTypeUid` and `documents`; the UI validates PDF/JPG/JPEG/PNG and the 10 MB limit before sending.
- `DELETE /investors/me/documents/:documentUid` — removes draft documents.
- `GET /investors/me/documents/:documentUid/download` — retrieves authenticated document bytes for review/download.
- `PUT /investors/me/compliance` — debounced partial drafts use `isDraft: true`; Continue sends the completed questionnaire.
- `POST /investors/me/submit` — submits the connected wallet address and relies on backend full-form, document-category, and wallet validation.

The shared Axios client continues to own JWT injection, session-expiry behavior, FormData content-type handling, timeouts, and the app's existing API conventions.

## State and recovery behavior

- Backend `currentStep` and `status` are authoritative.
- Local storage remains only a recovery cache for unsaved browser input; it cannot override a backend-completed step or submitted status.
- Identity and compliance text changes are debounced to backend draft endpoints.
- Document files are never persisted as browser mock blobs; only backend metadata is held in form state.
- A `submitted` backend record opens the completed state and is not exposed through editable steps.
- The optional RWA experience description is retained locally because it is present in the existing UI but is not part of the supplied backend compliance payload.

## Validation

- Identity requires all backend identity fields and age 18+.
- Country, state/province, and city are cascading dropdowns backed by the same location APIs used in organization onboarding.
- Location dropdowns store backend UIDs and the identity save payload sends `countryUid`, `stateUid`, and `cityUid`; labels are retained only for review/display and recovery compatibility.
- Country/state/city/gender values must match the current server-provided options.
- Compliance requires all documented fields, at least one investment category, and server-supported option values.
- At least one successful KYC identity document and one successful accreditation document are required before final submission.
- Upload files are limited to PDF/JPG/JPEG/PNG and 10 MB each.
- Wallet connection/network checks remain in the existing UI; the backend revalidates the wallet on submit.
- Backend field validation messages are mapped back onto matching form controls where available.

## Verification note

Source parsing/import checks can be run without project dependencies. A full `npm run lint` / `npm run build` requires the package versions in `package-lock.json` to be available from the configured npm registry and a Node version satisfying the project's declared engine (`>=22.22.1`).
