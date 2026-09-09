# Investment Journey Frontend Integration

This frontend uses the authenticated `/api/v1/investments/*` investment journey when `VITE_USE_MOCK_API=false`.

## Investor marketplace and resubmission

- `GET /investments/tokens` — marketplace catalogue with server pagination and search.
- `GET /investments/tokens/:tokenUid` — offering details and required claim topics.
- `GET /investments/tokens/:tokenUid/image` — authenticated token-image blob fetch.
- `GET /investments/tokens/:tokenUid/required-documents` — required claim-topic eligibility, missing/rejected flags, matching documents, current interest status, and rejection/resubmission metadata.
- `POST /investments/tokens/:tokenUid/interest` — creates or refreshes the investment interest. Backend `pending` is treated as document action required; backend `submitIntrest` is treated as pending issuer review.
- `GET /investments/me/interests` — powers My Applications and the offering status state.
- `POST /investors/me/documents` — reused from the investor onboarding API to upload missing or issuer-requested claim documents directly from the offering popup.

When the investor is missing documents, the frontend first ensures the backend interest record exists, then opens **Upload Missing Documents**. This is required because submitted investors may upload claim documents only when the backend has an eligible pending or resubmittable document-rejected interest. After each upload the frontend reloads backend eligibility instead of changing interest status locally.

The direct-upload popup validates PDF/JPG/JPEG/PNG extension, MIME type, maximum 10 MB file size, non-empty files, and supported file signatures before upload. Backend validation remains authoritative.

For a `DOC_REJECTED` decision, the popup shows the issuer reason, only exposes rejected/missing claim topics, and respects the backend `canResubmit` / `resubmitRemaining` values. `OTHER` rejections are not treated as document-resubmission flows.

## Issuer review

- `GET /investments/issuer/interests?status=submitIntrest` — default queue for requests ready for issuer review. The UI also supports the backend decision-status filters and `all`.
- `GET /investments/issuer/interests/:interestUid` — investor identity summary, submitted documents, and required claim-topic eligibility.
- `GET /investments/issuer/interests/:interestUid/documents/:documentUid/download` — protected investor-document download.
- `POST /investments/issuer/interests/:interestUid/approve` — verifies a `submitIntrest` request with an optional review note.
- `POST /investments/issuer/interests/:interestUid/reject` — rejects a `submitIntrest` request with either `DOC_REJECTED` or `OTHER`.

The rejection popup follows the backend payload exactly:

```json
{
  "rejectReasonType": "DOC_REJECTED",
  "rejectReason": "Optional explanation",
  "rejectedClaims": ["KYC"]
}
```

`DOC_REJECTED` requires at least one token-required claim topic. `OTHER` requires an explanatory rejection reason and does not send `rejectedClaims`. Approve/reject controls are enabled only while the request is in `submitIntrest`; backend `409` conflicts cause the page to reload the authoritative request state.

## Security and state consistency

- All investment and investor-document calls use the shared Axios client and existing Bearer JWT interceptor/RBAC backend routes.
- Route identifiers are URL encoded before request construction.
- Token images and issuer investor documents use authenticated blob requests; temporary object URLs are revoked.
- The frontend never promotes, approves, rejects, or resets an investment interest locally in API mode; it reloads the server state after writes.
- Server-side upload gates, ownership checks, status checks, resubmission caps, and claim-topic validation remain authoritative.
- Local marketplace/issuer mocks are used only when `VITE_USE_MOCK_API=true`.

## August 12 follow-up fixes

- A backend `submitted` investor profile no longer replays the onboarding success page after a fresh login or cleared browser storage. The success screen is shown only for the immediate successful submit transition in the mounted onboarding session; later visits redirect to the investor dashboard after the backend profile is loaded.
- The **Upload Missing Documents** dialog now uses accessible custom dropdown menus for claim topic and matching document type instead of browser-native option rendering.
- Verification progress uses **Uploaded** for satisfied claim topics instead of **Verified**.
- The uploaded-document list is rebuilt from backend eligibility data, shows each document's claim topic and document type, and exposes a guarded remove action.
- Remove calls `DELETE /investors/me/documents/:documentUid` and then reloads eligibility. The supplied backend collection documents that delete route as draft-only, so a backend `403` is surfaced without locally pretending that the server document was deleted.
- The issuer Subscription Requests filter defaults to **All Requests** while retaining the existing per-status filters.


## Application details and immutable activity history

- `GET /investments/me/interests/:interestUid/history` powers the investor **Application Details** timeline. The My Applications CTA now routes to this application-scoped screen instead of returning to the offering.
- `GET /investments/issuer/interests/:interestUid/history` powers the issuer **Application Activity** accordion.
- Timeline responses are rendered latest-first in the UI without mutating the API response. Each `submitted` / `resubmitted` item reads only its own `documents[]` snapshot; the frontend never substitutes current investor-profile documents for historical submissions.
- Historical documents are viewed through role-scoped protected download endpoints. Investor history uses the investor document endpoint returned by the backend contract; issuer history uses the issuer application-scoped document endpoint.
- A document-rejected application shows **Re-upload** only when the current backend summary allows resubmission. It reuses the existing requested-document modal and refreshes both current application state and the immutable history after the write.
- Issuer decisions remain enabled only for the current `submitIntrest` state. Approval/rejection is followed by a fresh request + history read so a new event appears instead of overwriting a prior submission.
- The issuer request page is scoped to one interest UID and therefore shows only that issuer/application's snapshots, rejection reasons, and timeline.
