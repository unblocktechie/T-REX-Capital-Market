# Investor Onboarding

A three-step investor KYC / accreditation onboarding flow, mirroring the organization
onboarding structure. There is **no admin verification** step; instead, submit creates the
investor's **on-chain OnchainID identity** (same factory as the organization approval) and,
only when that succeeds, finalizes the record to `submitted`.

Steps: **Identity Details → Identity Documents → Compliance Questionnaire → Review & Submit.**

All endpoints reuse the existing JWT authentication + DB-driven RBAC (`permissionMaster`) and
are **Investor-only** (`userRole` `Investor`, `00000000-0000-4000-8000-000000000004`).

## Status lifecycle

| Phase | `currentStep` | `status` |
|---|---|---|
| Identity details saved | `identityDocuments` | `draft` |
| KYC documents uploaded | `identityDocuments` | `draft` |
| Compliance saved | `completed` | `draft` |
| Submitted | `completed` | `submitted` |

Drafts are editable; once `submitted`, the record is locked (edits return `409`).

## Document types (`investorDocumentTypeMaster`)

A dedicated master with a **`documentCategory`** column so the frontend can render two
separate dropdowns:

- **kyc** (identity): Passport, National ID, Driver's License
- **accredited**: Bank Reference Letter, Investment Portfolio Statement, Net Worth Statement,
  Income Certificate, Tax Return, Accountant or CPA Certification, Accredited Investor Certificate

`GET /investor-options` returns them pre-grouped as `identityDocumentTypes` and
`accreditationDocumentTypes`, alongside the enum option sets (genders, sources of wealth,
net-worth ranges, investment capacities, investment categories, accreditation types). Country /
state / city come from the shared location master via the `/locations` reference endpoints
(not from this options payload).

## Endpoints

### GET `/api/v1/investor-options` (public)
Reference data for the whole form (document types by category + option sets).

### GET `/api/v1/investors/me`
Returns the investor form: identity + compliance fields, `investmentCategories` (codes),
and `documents` (each with `documentCategory`). `null` when onboarding has not started.

### PUT `/api/v1/investors/me/identity`
Save step 1. `isDraft: true` saves a partial draft; `isDraft: false` requires all identity
fields and advances `currentStep` to `identityDocuments`. Enforces age ≥ 18. Country / state /
city are stored as **location-master UIDs** (`countryUid`, `stateUid`, `cityUid`) and validated
as a parent-child hierarchy — exactly like organization onboarding. The frontend populates the
cascading dropdowns from the existing reference endpoints: `GET /api/v1/locations/countries`,
`GET /api/v1/locations/countries/:countryUid/states`, `GET /api/v1/locations/states/:stateUid/cities`.
```json
{ "firstName": "Lois", "lastName": "Hall", "dateOfBirth": "1990-03-10", "gender": "male",
  "streetAddress": "221B Baker Street", "countryUid": "<uid>", "stateUid": "<uid>",
  "cityUid": "<uid>", "isDraft": false }
```
The `GET /investors/me` response joins the masters to include `countryName`, `stateName`,
and `cityName` for display.

### POST `/api/v1/investors/me/documents`  (multipart)
Upload KYC identity documents (step 2) or accreditation documents (step 3). Body:
`documentTypeUid` + one or more `documents` files (PDF/PNG/JPG, ≤ 10 MB). The category is
derived from the document type. Re-uploading the same type replaces the previous file.

### GET / DELETE `/api/v1/investors/me/documents[/:documentUid]`
List all documents (grouped by category), delete one, or `GET .../:documentUid/download`.

### PUT `/api/v1/investors/me/compliance`
Save step 3. `isDraft: false` requires source of wealth, net worth, capacity, previous-RWA
answer, accreditation type, years of experience, and at least one investment category; it
advances `currentStep` to `completed`. Investment categories are validated against the allowed
codes (`public_markets`, `private_markets`, `real_estate`, `digital_assets`) and stored in the
`investorInvestmentCategory` child table.
```json
{ "sourceOfWealth": "Business Ownership", "estimatedNetWorth": "Below $100,000",
  "annualInvestmentCapacity": "$500,000 – $1,000,000",
  "investmentCategories": ["public_markets", "digital_assets"], "yearsOfExperience": 5,
  "previousRwaExperience": "no", "accreditationType": "institutional", "isDraft": false }
```

### POST `/api/v1/investors/me/submit`
Finalizes onboarding. Validates the full form (identity + compliance complete, ≥ 1 KYC
document, ≥ 1 accreditation document, valid wallet), then **creates the investor's on-chain
OnchainID identity** using the same identity factory the organization approval flow uses
(`getIdentity` → `createIdentity(walletAddress, salt)`, salt `investor-<investorUid>`,
idempotent — an existing identity is reused). Only **after that call succeeds** is the record
finalized to `status = submitted` with the identity address and transaction details saved. There
is no admin verification step — the on-chain identity creation replaces it.
```json
{ "walletAddress": "0x..." }
```

The wallet is normalized to lowercase and may belong to only one submitted investor profile,
regardless of the account email address. If another submitted investor already owns it, the API
returns HTTP `409` with code `INVESTOR_WALLET_ALREADY_REGISTERED` before making a blockchain call.
The database-generated `registeredWalletAddress` and unique index provide the same guarantee for
concurrent requests. Draft or failed submissions do not reserve a wallet until they become
`submitted`.
On success `data` includes `status: "submitted"`, `contractAddress` (the OnchainID identity
address), `onchainIdReference` (same address), `contractTxnHash`, `contractTxnMessage`, and
`profileReference` (`INV-XXXXXXXX`).

If the on-chain call fails, the endpoint returns **`502 INVESTOR_IDENTITY_CREATION_FAILED`**
(with a secret-redacted `contractTxnMessage`) and the record **stays `draft`** — the failed tx
hash/message are recorded so the user can retry. Requires `SEPOLIA_RPC_URL`,
`IDENTITY_FACTORY_ADDRESS`, and `DEPLOYER_PRIVATE_KEY` to be configured.

## Data model

- `investorMaster` — one row per user (`ukInvestorMasterUserUid`): identity + compliance fields,
  with one normalized wallet per submitted investor (`ukInvestorMasterRegisteredWallet`),
  wallet + profile reference, `currentStep` / `isDraft` / `status`.
- `investorDocumentTypeMaster` — KYC + accredited document types with `documentCategory`.
- `investorInvestmentCategory` — child table (replace-pattern) for the multi-select categories.
- `investorDocument` — uploaded files, each carrying its `documentCategory`.

Migration: `database/migrations/20260909_add_investor_onboarding.sql` (creates the tables,
seeds the document types, adds the Investor Onboarding menu and the eight Investor
`permissionMaster` rows). Idempotent. Investor document files are stored under
`INVESTOR_UPLOAD_DIR` (default `storage/investor-documents`).

Existing installations must also apply
`database/migrations/20260910_add_unique_investor_wallet.sql`. The migration deliberately
fails instead of altering data if historical submitted-wallet duplicates are present; resolve
such identity conflicts explicitly before rerunning it.
