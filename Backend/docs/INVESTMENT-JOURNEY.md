# Investment Journey

A read-only token **marketplace** plus an investor **"express interest"** flow gated by
claim-topic document eligibility, and an issuer **review** view of incoming interests.

All endpoints reuse the existing JWT authentication + DB-driven RBAC (`permissionMaster`).
Migrations (idempotent): `database/migrations/20260909_add_investment_journey.sql` and
`database/migrations/20260909_investment_interest_reject_flow.sql` (adds `submitIntrest` status,
the reject/resubmission columns, and issuer approve/reject permissions), and
`database/migrations/20260909_investment_interest_history.sql` (adds the timeline history table
and the investor/issuer history-read permissions), and
`database/migrations/20260909_document_versioning_and_submission_snapshot.sql` (adds document
versioning columns and the per-submission document snapshot table), and
`database/migrations/20260909_add_verified_by_issuer_status.sql` (adds the `verifiedByIssuer`
status the issuer's review now sets), and
`database/migrations/20260909_add_verified_by_issuer_history_event.sql` (adds the
`verifiedByIssuer` timeline event type).

## What was added

1. **`claimTopicCode`** (`KYC` / `ACCREDITED_INVESTOR`) on `investorDocumentTypeMaster` and
   `investorDocument`, alongside the existing `documentCategory`. Uploaded documents now record
   which claim topic they satisfy, so the system can tell whether an investor holds a document
   for each claim topic an issuer required on a token. Existing rows are backfilled from
   `documentCategory` (`kyc → KYC`, `accredited → ACCREDITED_INVESTOR`).
2. **`tokenInvestmentInterest`** — one active row per `(tokenUid, investorUid)`; an investor's
   "submit interest" creates a `pending` request carrying the token, organization, investor,
   and wallet.

## Claim-topic eligibility

An issuer selects the claim topics a token requires when creating it (`tokenClaimTopic` →
`claimTopicMaster.claimTopicCode`). An investor is **eligible** for a token when, for **every**
required claim-topic code, they have at least one active `investorDocument` with that
`claimTopicCode`. This is computed by `InvestmentService.buildEligibility` and is enforced both
on the read (`/required-documents`) and on the write (`/interest`).

## Endpoints

### Marketplace — Admin + Investor

`GET /api/v1/investments/tokens`

For an authenticated investor, the marketplace automatically excludes country-ineligible
tokens using the country selected in that investor's active profile. An active `blocklist`
excludes a token when `tokenCountryRestriction` contains the investor's `countryUid`; an
active `allowlist` excludes it when the country is not listed. The filter is applied before
pagination and counting. Admin marketplace requests are not country-filtered.

List the token catalogue. Query: `page`, `limit`, `search` (name/symbol), `status`. Each item
includes name, symbol, decimals, price, description, company,
`organizationCountryName`, `organizationCountryCode` (the organization's own country),
`maxInvestors` (also returned as `maxHolder`), `maxBalancePerInvestor`,
`countryRestrictionMode`, `countryRestrictions`
(`countryUid`, `countryCode`, `countryName`, `numericCode`), `hasImage`, and `imageUrl`; the
internal storage key is never returned. Paginated via the response `meta`
(`page`, `limit`, `total`, `totalPages`).

**Role-based status filter:** an **admin** may filter by any token status
(`draft`, `readyToDeploy`, `deploymentPending`, `deploymentFailed`, `deployed`, or `all`). An
**investor** only ever receives `deployed` tokens — the `status` filter is ignored for the
investor role and always forced to `deployed`.

`GET /api/v1/investments/tokens/:tokenUid`
Full token details plus `treasuryWalletAddress`, `maxInvestors`, `maxBalancePerInvestor`, `countryRestrictionMode`,
`countryRestrictions` (country code / name / numeric code), and `requiredClaimTopics` (the claim
topics the issuer required).

`GET /api/v1/investments/tokens/:tokenUid/image`
Streams the optimized token image (served from the shared token-image storage).

### Investor journey — Investor

`GET /api/v1/investments/tokens/:tokenUid/required-documents`
For a token, returns every required claim topic with `satisfied`, a **`missing`** flag (no
document), a **`rejected`** flag (the topic code appears in the interest's `rejectedClaim`), and
the investor's matching `documents` — plus an overall `eligible` flag, the `missingClaimTopics`,
the current `interestStatus`, and a `rejection` block when the interest was rejected
(`rejectReasonType`, `rejectReason`, `rejectedClaim`, `rejectedCount`, `canResubmitClaim`,
`resubmitRemaining`, `canResubmit`). The frontend uses this in the profile section to prompt the
investor to upload the missing / rejected claim-topic documents (reusing the existing
`POST /api/v1/investors/me/documents` upload).

`POST /api/v1/investments/tokens/:tokenUid/interest`  (body: `{ "note": "..." }` optional)
**Always creates (or refreshes) an interest record.** If any required claim-topic document is
missing → status `pending` (invisible to the issuer). If every required document is present →
status `submitIntrest` (visible to the issuer). Enforced server-side: onboarding must be
`submitted`, the token must be `deployed`. One active interest per token; an already
`approved`/`rejected` interest returns `409`, and a `pending` interest is promoted to
`submitIntrest` here once documents are complete.

`GET /api/v1/investments/me/interests`  (query: `status` optional)
The investor's own interests with token summary, including the token's `maxInvestors` and
`maxBalancePerInvestor` caps.

`GET /api/v1/investments/me/interests/:interestUid/history`
The full rejection / resubmission **timeline** for one of the investor's own interests
(ownership enforced). See *Timeline history* below.

### Issuer review — Issuer

`GET /api/v1/investments/issuer/interests`  (query: `status`, default **`submitIntrest`**)
Interests for the issuer's organization, each with investor identity summary. The issuer **only
sees `submitIntrest` requests** — `pending` (documents-incomplete) requests are never listed.

`GET /api/v1/investments/issuer/interests/:interestUid`
A single interest (asserts organization ownership) with the **documents from the latest
submission snapshot** of this application — each carrying its `claimTopicCode`, `versionNumber`,
and a `downloadUrl` (issuers see only their own application's exact versions) — plus
`submissionNumber`, the required claim-topic eligibility breakdown, and a `resubmissionSummary`
(`timesRejected`, `timesResubmitted`, `rejectedCount`, `canResubmitClaim`, `resubmitRemaining`,
`canResubmit`).

`GET /api/v1/investments/issuer/interests/:interestUid/history`
The full rejection / resubmission **timeline** for one interest in the issuer's organization
(ownership enforced). See *Timeline history* below.

`POST /api/v1/investments/issuer/interests/:interestUid/approve`  (body: `{ "note": "..." }` optional)
The issuer's positive review — promotes a `submitIntrest` interest to `verifiedByIssuer`, but
**only when a `SIGNED` issuer claim verification exists** for it (all required claim topics
cryptographically verified — see ISSUER-CLAIM-SIGNATURE.md); otherwise `409
ISSUER_CLAIMS_NOT_VERIFIED` and the status is left unchanged. `409` too if it is not
`submitIntrest`. A separate `approved` status is reserved for a future step.

`POST /api/v1/investments/issuer/interests/:interestUid/reject`
Rejects a `submitIntrest` interest (→ `rejected`). Body:
`{ "rejectReasonType": "DOC_REJECTED" | "OTHER", "rejectReason": "…", "rejectedClaims": ["KYC", …] }`.
`DOC_REJECTED` requires one or more `rejectedClaims` (validated against the token's required
claim topics; stored comma-separated in `rejectedClaim`). `OTHER` takes no claim selection.

`GET /api/v1/investments/issuer/interests/:interestUid/documents/:documentUid/download`
Downloads one of that investor's documents (ownership + path-safety checked).

## Status lifecycle & resubmission

`pending → submitIntrest → verifiedByIssuer | rejected` (`approved` reserved for a future step).
A rejected interest can return to
`submitIntrest` via resubmission (`DOC_REJECTED` only).

1. Investor submits interest → `pending` (docs missing) or `submitIntrest` (docs complete).
2. **Document upload gate** (`POST /investors/me/documents`): a **non-submitted** investor
   uploads normally (onboarding). A **submitted** investor may upload only when they have a
   `pending` interest, or a `DOC_REJECTED` interest with resubmission attempts remaining —
   otherwise `403 INVESTOR_DOCUMENT_UPLOAD_NOT_ALLOWED`. This is enforced on the backend and
   cannot be bypassed from the frontend.
3. After a submitted investor uploads, the backend re-syncs their interests: a `pending`
   interest whose documents are now complete becomes `submitIntrest`; a `DOC_REJECTED` interest
   whose rejected claim topics were all re-uploaded (document `createdAt` after the rejection
   `decisionAt`) becomes `submitIntrest`, `canResubmitClaim` is incremented, and `rejectedClaim`
   is cleared.
4. Issuer sees only `submitIntrest`, and approves or rejects.
5. **Resubmission cap:** `rejectedCount` (default 3) is the maximum number of resubmissions;
   `canResubmitClaim` counts resubmissions used and is **not** reset on each rejection, so once
   `canResubmitClaim` reaches `rejectedCount` the investor can no longer resubmit. (The spec's
   "initialize `canResubmitClaim = 0`" is applied at record creation so the cap is meaningful
   across the interest's lifetime — tell me if you instead want it reset on every rejection.)

## Document versioning & per-application snapshots

Investor documents are a **versioned reusable profile**. `investorDocument` is append-only: the
"current profile" is the latest version per document type (`isCurrent = 1`). Re-uploading a
document of an existing type supersedes the previous version (`isCurrent = 0`) but **keeps the
old row and file forever** for audit/history — nothing is deleted or unlinked. Each version
records `versionNumber` and `uploadedByUserUid`.

When an application is **submitted** or **resubmitted**, the exact current document versions are
snapshotted into `investmentSubmissionDocument`, linked to that timeline event and a
`submissionNumber`. The snapshot **pins** those versions: if the investor later uploads a new
version to their profile, previously-submitted applications keep referencing the exact version
they were submitted with. Example: Passport v1 → Application A snapshots v1 → rejected → investor
uploads v2 → Application B snapshots v2. Later v3 is uploaded — but Application A still shows v1,
Application B still shows v2, and the profile shows v3.

**Issuer isolation.** An issuer only ever sees the documents in **their own application's
submission snapshot** (the latest submission's versions). The issuer detail's `documents` and the
download endpoint both resolve through the snapshot, so an issuer can never reach the investor's
other versions, their live profile, or another issuer's application/rejection history. The issuer
detail also returns `submissionNumber` (the latest submission) and each document's `versionNumber`.

## Timeline history

Every interest keeps an append-only timeline in `tokenInvestmentInterestHistory`, so **both the
issuer and the investor** can see the whole rejection / resubmission history — not just the
current state. An event is written whenever the interest becomes `submitIntrest` (`submitted`),
is rejected (`rejected`, with `rejectReasonType` + `rejectReason` + the `rejectedClaim` codes),
is resolved by a resubmission (`resubmitted`, with the `resubmitAttempt` number and the claim
topics re-uploaded), is approved (`approved`), or is verified by the issuer via successful claim
signing (`verifiedByIssuer`). Each event records the actor
(`actorRole` = `investor` / `issuer` / `system`, plus `actorUserUid`) and `createdAt`.

Both history endpoints return the same shape:

```json
{
  "interestUid": "…", "tokenUid": "…", "tokenName": "Acme", "status": "rejected",
  "summary": {
    "status": "rejected", "rejectReasonType": "DOC_REJECTED", "rejectReason": "…",
    "currentRejectedClaim": ["KYC"], "rejectedCount": 3, "canResubmitClaim": 1,
    "resubmitRemaining": 2, "canResubmit": true, "timesRejected": 2, "timesResubmitted": 1
  },
  "timeline": [
    { "eventType": "submitted",   "actorRole": "investor", "createdAt": "…" },
    { "eventType": "rejected",    "rejectReasonType": "DOC_REJECTED", "rejectReason": "Passport blurry", "rejectedClaim": ["KYC"], "actorRole": "issuer", "createdAt": "…" },
    { "eventType": "resubmitted", "rejectedClaim": ["KYC"], "resubmitAttempt": 1, "actorRole": "investor", "createdAt": "…" },
    { "eventType": "rejected",    "rejectReason": "Still unreadable", "rejectedClaim": ["KYC"], "actorRole": "issuer", "createdAt": "…" }
  ]
}
```

`timeline` is chronological (oldest first). `summary.timesRejected` / `timesResubmitted` come
from the events; `resubmitRemaining` = `rejectedCount − canResubmitClaim`.

Each `submitted` / `resubmitted` event also carries the **documents submitted at that point**
(`submissionNumber` + a `documents[]` of `documentUid`, `documentTypeName`, `documentCategory`,
`claimTopicCode`, `versionNumber`, `originalFileName`, `mimeType`, `fileSize`, `downloadUrl`).
The `downloadUrl` is role-scoped: the investor timeline links to
`/api/v1/investors/me/documents/:documentUid/download`; the issuer timeline links to
`/api/v1/investments/issuer/interests/:interestUid/documents/:documentUid/download`. This is what
lets both sides see, view, and download the exact documents attached to each submission — the
audit trail shown in the reference UI.

## Data model

- `tokenInvestmentInterest` — `interestUid` PK, `tokenUid`, `organizationUid`, `investorUid`,
  `investorUserUid`, `walletAddress`, `status` (`pending`/`submitIntrest`/`verifiedByIssuer`/`approved`/`rejected`/`cancelled`),
  `rejectReasonType`, `rejectReason`, `rejectedClaim` (csv of claim-topic codes),
  `rejectedCount` (default 3), `canResubmitClaim` (default 0),
- `tokenInvestmentInterestHistory` — append-only timeline: `historyUid` PK, `interestUid`,
  `tokenUid`, `organizationUid`, `investorUid`, `eventType`
  (`submitted`/`rejected`/`resubmitted`/`approved`/`verifiedByIssuer`), `rejectReasonType`, `rejectReason`,
  `rejectedClaim`, `resubmitAttempt`, `actorRole`, `actorUserUid`, `note`, `createdAt`.
- `investorDocument` (versioned) — adds `versionNumber`, `isCurrent` (latest version per type),
  `uploadedByUserUid`. Append-only; superseded versions retained (never unlinked).
- `investmentSubmissionDocument` — per-submission document snapshot: `submissionDocumentUid` PK,
  `historyUid` (the submission event), `interestUid`, `tokenUid`, `organizationUid`,
  `investorUid`, `submissionNumber`, `documentUid` (exact version), plus a copy of
  `documentTypeName`/`documentCategory`/`claimTopicCode`/`versionNumber`/`originalFileName`/
  `storageKey`/`mimeType`/`fileSize`.
  `note`, `submittedAt`, `decisionAt`, timestamps. Unique `(tokenUid, investorUid)`.
- `investorDocument.claimTopicCode`, `investorDocumentTypeMaster.claimTopicCode`.

## Permissions seeded

Menu `Investments` (`/investments`). `permissionMaster` rows: marketplace list/detail/image for
Super Admin (`…001`) and Investor (`…004`); journey endpoints for Investor; review endpoints for
Issuer (`…003`). Every protected route has a matching seed, so RBAC allows the intended roles.

## Tests

`tests/unit/investment.test.js` — schema defaults/validation and service behavior: pagination
and image-URL shaping, eligibility (satisfied / missing topic), submit-interest happy path and
every guard (not submitted, not deployed, duplicate, missing documents, no-required-topics),
and issuer ownership + document listing. Run: `node --test tests/unit/investment.test.js`.
