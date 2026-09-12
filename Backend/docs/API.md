# T-REX Capital Market API reference

Base URL: `http://localhost:3000/api/v1`. Swagger UI: `http://localhost:3000/api-docs`.

Protected calls require `Authorization: Bearer <accessToken>`. Their role must contain an active, allowed `permissionMaster` record matching the HTTP method and Express route template.

## Standard envelopes

Success:

```json
{
  "success": true,
  "message": "Request completed successfully.",
  "data": {},
  "timestamp": "2026-07-22T10:00:00.000Z",
  "requestId": "b341b8d5-f66a-4b25-b847-b413f86a8131"
}
```

Validation error:

```json
{
  "success": false,
  "message": "Request validation failed.",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "body.email", "message": "email must be a valid email" }]
  },
  "timestamp": "2026-07-22T10:00:00.000Z",
  "requestId": "b341b8d5-f66a-4b25-b847-b413f86a8131"
}
```

## Health and public settings

`GET /api/health` or `GET /api/v1/health` returns API status, uptime seconds, environment, UTC timestamp, and version.

`GET /general-settings/public` returns an object of active public settings with values converted using `valueType`.

## Authentication

### `POST /auth/signup`

```json
{ "fullName": "Ada Lovelace", "email": "ADA@example.com", "password": "Launch!234", "isIssuer": true }
```

`isIssuer` is required. `true` assigns the seeded **Issuer** role (`00000000-0000-4000-8000-000000000003`); `false` assigns the seeded **Investor** role (`00000000-0000-4000-8000-000000000004`). Returns `201` and the new user without `passwordHash`. Email is trimmed/lowercased and the server sends a verification message.

### `POST /auth/resend-verification`

```json
{ "email": "ada@example.com" }
```

Returns HTTP `200`. When the account is already verified, no email is sent and the response is:

```json
{
  "success": true,
  "message": "User is already verified. You can log in.",
  "data": { "status": "ALREADY_VERIFIED", "emailVerified": true }
}
```

For an eligible unverified account, any previous unused verification link is revoked and a
new email is sent. Unknown and inactive accounts retain the generic accepted response. Their
existence or state is not disclosed.

### `POST /auth/verify-email`

```json
{ "token": "<64-hex-character-token>" }
```

Atomically verifies the email, consumes the one-time token, records the verification and
last-login timestamps, and returns the same Bearer JWT session shape as `/auth/login`.
The JWT is issued only when the user and assigned role are active. Invalid, expired, revoked,
or previously used tokens return `400`; an inactive user or role returns `403`.

```json
{
  "success": true,
  "message": "Email verified and login successful.",
  "data": {
    "accessToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": "1h",
    "user": {
      "userUid": "...",
      "roleUid": "...",
      "fullName": "Ada Lovelace",
      "email": "ada@example.com",
      "roleName": "Investor",
      "emailVerified": true
    }
  }
}
```

The email URL still opens the frontend `/verify-email?token=...` page. That page must submit
the token to this POST endpoint; there is intentionally no state-changing GET endpoint.

### `POST /auth/login`

```json
{ "email": "ada@example.com", "password": "Launch!234" }
```

```json
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "user": {
    "userUid": "...", "roleUid": "...", "fullName": "Ada Lovelace",
    "email": "ada@example.com", "roleName": "Issuer"
  }
}
```

JWT standard claims include `iat`, `exp`, `iss`, `aud`, and `sub`; application claims include `userUid`, `roleUid`, `fullName`, `email`, and `roleName`.

### `POST /auth/forgot-password`

```json
{ "email": "ada@example.com" }
```

Returns `200` and sends an HTML/text reset email for an active registered user. An unregistered email returns `404 NOT_FOUND` with `This email is not registered. Please sign up first.` An inactive account returns `403 FORBIDDEN`. Older unused reset links are revoked.

### `GET /auth/verify-reset-token?token=<token>`

Returns `{ "valid": true }` when the token is active and unexpired.

### `POST /auth/reset-password`

```json
{ "token": "<64-hex-character-token>", "newPassword": "NewLaunch!567" }
```

The password is bcrypt-hashed and the token is consumed.

## Master CRUD APIs

All master collections support:

```text
GET ?page=1&limit=20&search=text&sortBy=createdAt&sortOrder=desc
POST /
GET /{resourceUid}
PUT /{resourceUid}
DELETE /{resourceUid}
```

Delete is a soft delete. A list response has:

```json
{
  "data": [],
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
}
```

### Users: `/users`

Create:

```json
{
  "roleUid": "00000000-0000-4000-8000-000000000002",
  "fullName": "Grace Hopper",
  "email": "grace@example.com",
  "password": "Compiler!123",
  "emailVerified": true,
  "isActive": true
}
```

Update accepts any non-empty subset of `roleUid`, `fullName`, `email`, `password`, `emailVerified`, and `isActive`. Filters: `roleUid`, `emailVerified`, `isActive`. Search: `fullName`, `email`. Password fields/hashes are never returned.

### Roles: `/roles`

```json
{ "roleName": "Operations", "description": "Launch operations team", "isSystem": false, "isActive": true }
```

Update accepts the same fields. Filters: `isSystem`, `isActive`. Search: `roleName`, `description`. System roles cannot be disabled, downgraded, or deleted.

Built-in roles are Super Administrator, User (legacy managed accounts), Issuer, and Investor. Issuer and Investor receive `GET /api/v1/menus` and `GET /api/v1/menus/:menuUid` permission records by default. Administrative CRUD remains restricted to Super Administrator.

### Menus: `/menus`

```json
{
  "parentMenuUid": null,
  "menuName": "Launches",
  "menuCode": "LAUNCHES",
  "routePath": "/launches",
  "icon": "rocket",
  "displayOrder": 10,
  "isVisible": true,
  "isActive": true
}
```

Filters: `parentMenuUid`, `isVisible`, `isActive`. Search: `menuName`, `menuCode`, `routePath`.

### Permissions: `/permissions`

```json
{
  "roleUid": "<roleUid>",
  "menuUid": "<menuUid-or-null>",
  "permissionName": "List launches",
  "permissionCode": "LAUNCH_LIST",
  "httpMethod": "GET",
  "apiPath": "/api/v1/launches",
  "isAllowed": true,
  "isActive": true
}
```

`apiPath` must be the Express template (for example `/api/v1/users/:userUid`), not a concrete UUID URL. Filters: `roleUid`, `menuUid`, `httpMethod`, `isAllowed`, `isActive`.

### General settings: `/general-settings`

```json
{
  "settingKey": "application.pageSize",
  "settingValue": "25",
  "valueType": "number",
  "settingGroup": "application",
  "description": "Default frontend page size",
  "isPublic": true,
  "isActive": true
}
```

`valueType` is `string`, `number`, `boolean`, or `json`. Filters: `settingGroup`, `valueType`, `isPublic`, `isActive`. Search covers key, value, group, and description.

## Organization onboarding

Organization onboarding is available only to authenticated users whose role is `Issuer`. One issuer owns one organization form. Every section save remains a draft; `POST /organizations/me/submit` changes an initial application to `submitted` and a revised application to `resubmitted`.

### Public form reference APIs

```text
GET /locations/countries?page=1&limit=50&search=United
GET /locations/countries/{countryUid}/states?page=1&limit=50&search=California
GET /locations/states/{stateUid}/cities?page=1&limit=50&search=San
GET /organization-options
```

The location responses are paginated. `organization-options` returns active `entityTypes`, `industries`, and `documentTypes`; each document type includes `isRequired`.

### `GET /organizations/me`

Returns the issuer's complete form, beneficial owners, and document metadata. Returns `data: null` before the form is started.

### `PATCH /organizations/me/user-notified`

No request body. Idempotently sets the current issuer organization's `isUserNotified` value to `true` (`1` in MySQL) and returns the updated organization. Returns `404` when the issuer has not started an organization form.

### `PUT /organizations/me/company-information`

```json
{
  "legalCompanyName": "Acme Financial Holdings Ltd.",
  "entityTypeUid": "<entityTypeUid>",
  "registrationNumber": "LEI-5493001KJTIIGC8Y1R12",
  "streetAddress": "123 Financial District",
  "countryUid": "<countryUid>",
  "stateUid": "<stateUid>",
  "cityUid": "<cityUid>",
  "postalCode": "94105",
  "isDraft": false
}
```

With `isDraft: true`, all business fields are optional and partial progress is saved. With `false`, every field shown above is required and country/state/city membership is validated.

### `PUT /organizations/me/jurisdiction`

```json
{
  "countryOfIncorporationUid": "<countryUid>",
  "dateOfIncorporation": "2020-05-16",
  "taxIdentificationNumber": "US123456789",
  "industryUid": "<industryUid>",
  "businessActivity": "Asset tokenization and regulated financial services.",
  "website": "https://acme.example",
  "isDraft": false
}
```

The incorporation date cannot be in the future. Website is optional but must use HTTP or HTTPS.

### `PUT /organizations/me/beneficial-owners`

```json
{
  "owners": [
    {
      "fullName": "Jane Doe",
      "dateOfBirth": "1985-06-15",
      "nationalityCountryUid": "<countryUid>",
      "ownershipPercentage": 80,
      "isPrimary": true
    },
    {
      "fullName": "John Doe",
      "dateOfBirth": "1980-03-11",
      "nationalityCountryUid": "<countryUid>",
      "ownershipPercentage": 20,
      "isPrimary": false
    }
  ],
  "isDraft": false
}
```

Up to 20 owners can be stored. There is no minimum ownership percentage for an individual owner. A completed section requires at least one adult owner and the combined ownership of all owners must equal exactly 100%; no more than one owner can be primary. Drafts may contain an incomplete total but cannot exceed 100%. Saving replaces the current owner list atomically.

### Organization documents

Upload one or more files of the same document type using `multipart/form-data`:

```text
POST /organizations/me/documents
documentTypeUid=<documentTypeUid>
documents=<PDF, PNG, JPG, or JPEG file>
documents=<another file>
```

The default limit is 10 files per request and 10 MB per file; both are environment-configurable. The API stores document metadata and a SHA-256 checksum and returns `201`.

```text
GET    /organizations/me/documents
GET    /organizations/me/documents/{documentUid}/download
DELETE /organizations/me/documents/{documentUid}
```

### `POST /organizations/me/submit`

```json
{
  "walletAddress": "0x1111111111111111111111111111111111111111"
}
```

`walletAddress` is required and must be a valid EVM address (`0x` followed by 40 hexadecimal characters). It is normalized before storage. If the address is already assigned to an Investor account, submission returns HTTP `409` with code `WALLET_ALREADY_ASSIGNED_TO_INVESTOR`; an investor wallet cannot become an issuer wallet. If another issuer organization already owns the wallet, including one created under another email address, submission returns `409 ISSUER_WALLET_ALREADY_REGISTERED`. Final submission saves the address on the organization and revalidates every required company and jurisdiction field, location hierarchy, entity/industry references, owners, and every required document type. An initial submission sets `status: submitted`; the allowed revised submission sets `status: resubmitted`. Both set `isDraft: false`, `currentStep: completed`, and `submittedAt`.

## Token creation

Token creation requires an authenticated Issuer with an approved organization and valid organization `walletAddress`. One token row is uniquely bound to one organization. After the token becomes `readyToDeploy` or `deployed`, issuer edits are rejected; the organization cannot create another token. A `deploymentFailed` token remains eligible for another verified deployment submission.

`initialTokenPrice` is the immutable launch price. When token information is first saved, the backend
sets `currentTokenPrice` to the same value. Marketplace, portfolio and token detail responses return
both values and expose `tokenPrice` as the effective current price for compatibility.

### `GET /token-options`

Publicly returns:

- `decimals`: `[2, 6, 8, 18]`
- `countryRestrictionModes`: `allowlist`, `blocklist`
- Active claim topics from `claimTopicMaster`, including their numeric on-chain `value`. Seeded KYC has value `1`; Accredited Investor has value `2`.

Country choices come from `GET /locations/countries`. Each result includes `countryCode` (alpha-2) and `numericCode` (three-character ISO 3166-1 numeric code, such as `840` for the United States). Token restrictions persist the server-resolved numeric code.

### `GET /tokens/me`

Returns the current issuer's single token form, selected claim topics, country restrictions, organization wallet/identity context, and `imageUrl`. Returns `data: null` before a token draft is started.

### `PUT /tokens/me/information`

Uses `multipart/form-data`:

```text
tokenName=Acme Security Token
tokenSymbol=trex
decimals=18
initialTokenPrice=1.00
treasuryWalletAddress=0x1111111111111111111111111111111111111111
tokenDescription=Institutional security token
isDraft=false
tokenImage=<PNG, JPEG, WebP, or SVG file>
```

`tokenName` is trimmed, 3–50 characters, allows letters/numbers/spaces/hyphens/periods/apostrophes, cannot begin or end with punctuation, and cannot contain consecutive spaces. `tokenSymbol` is automatically uppercased and must contain 2–10 letters/numbers. Completed information requires every field except description and requires an existing or newly uploaded image.

The image limit is 2 MB with dimensions from 256×256 through 4096×4096. The API decodes the actual file rather than trusting its extension, rejects MIME/signature mismatches and corrupted or unsafe SVG files, optionally invokes ClamAV, then re-encodes the image to optimized WebP (maximum optimized dimension 1024) without EXIF metadata.

### `PATCH /tokens/me/price`

Only the authenticated issuer who owns the active deployed token may change its current price.

```json
{
  "currentTokenPrice": 1.25
}
```

The value must be greater than zero with no more than 18 decimal places. The update changes only
`currentTokenPrice`; it never changes `initialTokenPrice`. New purchase and redemption intents use
this value to calculate USDT, while transfer intents snapshot it as the transfer-time valuation.
Existing pending and completed transaction records retain their original price snapshot.

### `GET /tokens/me/image`

Returns the optimized WebP image inline. The issuer Bearer token is required.

### `PUT /tokens/me/claims`

```json
{
  "claimTopicUids": [
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002"
  ],
  "organizationActsAsTrustedClaimIssuer": true,
  "isDraft": false
}
```

A completed step requires at least one active claim topic and `organizationActsAsTrustedClaimIssuer: true`. The trusted issuer address is derived from the approved organization wallet; the client cannot override it. Multiple unique claim topics are supported.

### `PUT /tokens/me/compliance`

```json
{
  "maxInvestors": 2000,
  "maxBalancePerInvestor": 10000,
  "countryRestrictionMode": "allowlist",
  "countryUids": [
    "<countryUid>",
    "<anotherCountryUid>"
  ],
  "isDraft": false
}
```

`maxInvestors` must be an integer from 1 through 1,000,000,000. `maxBalancePerInvestor` is the absolute maximum token amount that one investor may hold; it must be greater than 0 and supports up to 18 decimal places. It is not a percentage. A completed step requires at least one unique country; every UID is resolved against active `countryMaster` rows, and `iso3166NumericCode` is persisted from the master.

### `PUT /tokens/me/governance`

```json
{
  "identityManagerWalletAddress": "0x1111111111111111111111111111111111111111",
  "isDraft": false
}
```

`identityManagerWalletAddress` must be a valid EVM address matching the approved organization's
`walletAddress` case-insensitively. The backend automatically stores
For a newly created token, `tokenAgentWalletAddress = PLATFORM_CONTROLLER_ADDRESS` (default
`0x972E9CEf9eA9d3A9d7f3261bb8e16bA59E76a0FB`). The frontend must treat this field as read-only
and should omit it from the request. A client-supplied Token Agent value is ignored. Existing token
rows keep the Token Agent assigned when they were created.

### `POST /tokens/me/submit`

The frontend deploys the TREX suite first, waits for the wallet transaction, and submits its hash:

```json
{
  "transactionHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

The backend revalidates all completed sections, active claims/countries, the optimized image,
trusted issuer, backend-configured Platform Controller Token Agent, and identity manager. It then
waits for the configured confirmation count, requires a successful receipt, accepts
`TREXSuiteDeployed` only from `TREX_FACTORY_ADDRESS`, resolves the block timestamp, and saves:

```json
{
  "platformAgentWallet": "0x1111111111111111111111111111111111111111",
  "tokenAddress": "0x2222222222222222222222222222222222222222",
  "identityRegistryAddress": "0x3333333333333333333333333333333333333333",
  "identityRegistryStorageAddress": "0x4444444444444444444444444444444444444444",
  "trustedIssuersRegistryAddress": "0x5555555555555555555555555555555555555555",
  "claimTopicsRegistryAddress": "0x6666666666666666666666666666666666666666",
  "modularComplianceAddress": "0x7777777777777777777777777777777777777777",
  "deployTxHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "deployedAtBlock": 9000000,
  "deployedAt": "2026-07-31T00:00:00.000Z",
  "status": "deployed"
}
```

`platformAgentWallet` is taken from the confirmed transaction sender. The legacy compatibility fields `contractAddress` and `contractTxnHash` mirror `tokenAddress` and `deployTxHash`. If the transaction failed, the factory event is absent, an emitted address is zero/invalid, or block metadata cannot be resolved, the backend stores `status: deploymentFailed` and `contractTxnMessage`, then returns `422 TOKEN_DEPLOYMENT_VERIFICATION_FAILED`. A failed record can be retried with another transaction hash; a deployed record is immutable.

## Admin organization review

These APIs require an administrator JWT and the seeded Super Administrator permissions.

### `GET /admin/organizations`

Returns all organization applications that have reached submission, including pending, approved, and rejected applications. A first-rejection application remains visible while its issuer prepares the allowed revision.

```text
GET /admin/organizations?page=1&limit=20&search=acme&status=submitted&sortBy=submittedAt&sortOrder=desc
```

`status` is optional and supports `submitted`, `resubmitted`, `underReview`, `approved`, and `rejected`. Search covers company name, registration number, wallet address, issuer name, and issuer email.

### `GET /admin/organizations/{organizationUid}`

Returns the complete submitted application, issuer identity, resolved form labels, beneficial owners, and document metadata. Document-level review status is intentionally not used; review status belongs only to `organizationMaster`.

### `GET /admin/organizations/{organizationUid}/documents/{documentUid}/file`

Securely returns a document belonging to the selected organization.

```text
GET /admin/organizations/{organizationUid}/documents/{documentUid}/file
GET /admin/organizations/{organizationUid}/documents/{documentUid}/file?disposition=attachment
```

`disposition=inline` is the default and supports browser preview for PDF/PNG/JPG files. Use `attachment` to download using the original filename. The request requires the administrator Bearer token and returns binary file content, not the JSON response envelope.

### `PATCH /admin/organizations/{organizationUid}/status`

Approve:

```json
{
  "status": "approved"
}
```

Approval first checks the configured Arc Testnet OnchainID factory for the organization's submitted `walletAddress`. If no identity exists, the API creates one with the deterministic salt `org-{organizationUid}` and waits for the configured confirmations. A successful response includes:

```json
{
  "success": true,
  "message": "On-chain organization identity created; application approved successfully.",
  "data": {
    "status": "approved",
    "contractAddress": "0x2222222222222222222222222222222222222222",
    "contractTxnHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "contractTxnMessage": "On-chain organization identity created; application approved successfully."
  }
}
```

If the wallet already has an identity, approval reuses that address, returns `contractTxnHash: null`, and reports that it already existed. If lookup, submission, confirmation, or identity verification fails, the API returns `502` with code `ORGANIZATION_IDENTITY_CREATION_FAILED`; `contractTxnMessage` and any available transaction hash are saved, while the application status remains unchanged and can be retried.

Reject:

```json
{
  "status": "rejected",
  "rejectionReason": "Please replace the expired incorporation document and verify the registration number."
}
```

`rejectionReason` is required only for rejection and must be 10–2,000 characters.

Rejection lifecycle:

- First rejection: `rejectionCount: 1`, `canResubmit: true`. The reason is returned by `GET /organizations/me`; the issuer can edit any section and resubmit once.
- During revision the main `status` remains `rejected` and `isDraft` becomes true, so the rejection remains visible but cannot be reviewed again yet.
- Resubmission: status becomes `resubmitted`, `canResubmit` becomes `false`, and `rejectionReason` is cleared.
- Second rejection: `rejectionCount: 2`, `canResubmit: false`. All issuer edits and further submission attempts return `409`; the frontend should show Contact Sales.
- Approval: OnchainID creation/reuse must succeed before the application becomes read-only and rejection data is cleared.

## Investor claim submission and synchronization

These endpoints require an investor JWT. `claimId` is the issuer claim signature UID and
`interestId` is the investment interest UID.

- `GET /investor/claims?interestId=...` lists signed claims and their submission state.
- `POST /investor/claims/{claimId}/prepare` with `{ "interestId": "..." }` creates the one
  `PENDING` row and returns trusted on-chain call parameters.
- `POST /investor/claims/{claimId}/submit` with `{ "interestId": "...", "txHash": "0x..." }`
  durably records the hash and verifies the exact receipt event. It returns `200 CONFIRMED` or
  `202 PENDING_CONFIRMATION` when the transaction still needs confirmations.
- `POST /investor/claims/{claimId}/retry` with `{ "interestId": "..." }` is a fast recovery API.
  It verifies an existing hash, otherwise performs one exact `Identity.getClaim` read. It returns
  `CONFIRMED`, `PENDING_CONFIRMATION`, `TRANSACTION_REQUIRED`, or HTTP `202 SYNCING`.

Retry never runs a large historical log scan and never sends a transaction. The global indexer and
targeted recovery worker obtain the actual `ClaimAdded`/`ClaimChanged` `event.transactionHash` and
update the existing row. The frontend should open MetaMask only for `TRANSACTION_REQUIRED`.

See `docs/INVESTOR-CLAIM-SUBMISSION.md` for payloads and
`docs/CLAIM-INDEXER.md` for the production worker architecture.

## Identity Registry registration (Issuer)

- `POST /investments/issuer/interests/{interestUid}/registry-registration` validates ownership,
  token/investor/claim/country eligibility and registry agent state, then creates or returns the one
  `PENDING` operation with backend-authoritative `registerIdentity` arguments. If matching registry
  state already exists, it recovers and fully verifies the historical registration transaction,
  inserts the operation directly as `CONFIRMED` without a PENDING stage or MetaMask transaction,
  and synchronizes the subscription instead of returning `INVESTOR_ALREADY_REGISTERED`.
- `GET /investments/issuer/interests/{interestUid}/registry-registration` resumes the operation.
- `POST /investments/issuer/interests/{interestUid}/registry-registration/{registryRegistrationUid}/confirm`
  accepts only `{ "txHash": "0x..." }`. It verifies chain, issuer sender, zero native value and
  either a direct registry call or a strictly decoded call through an allowlisted MetaMask
  Delegation Manager. The direct/nested registry target, `registerIdentity` calldata, canonical
  receipt, deployed-version `IdentityRegistered` event and final state must all match before the
  operation is atomically confirmed.

Successful confirmation also atomically changes the subscription from `claimSubmitted` to
`registered` and records a single `registered` event in `tokenInvestmentInterestHistory`. The API
and fallback worker share this idempotent finalization path.

Unmined/under-confirmed hashes return `202`; definitive mismatches remain `PENDING` and return `422`.
The global registry indexer plus targeted recovery worker reconciles frontend-crash cases without
creating transactions or trusting events alone. See `docs/IDENTITY-REGISTRY-REGISTRATION.md`.

## Frontend-executed blockchain transactions

Invest and Send are executed directly by the authenticated investor wallet. After the off-chain
redemption request is approved, Redeem is executed by the owning issuer wallet. The backend does
not prepare, sign, relay, mint, burn, transfer USDT, or continue these transactions.

- `POST /investments/transactions/confirm` accepts `{ chainId, txHash, tokenUid, expectedAction }`,
  where `expectedAction` is `INVEST`, `TRANSFER`, or `REDEMPTION`. It independently verifies the
  current canonical transaction, role/ownership, sender, target, calldata, deployed token, receipt, events,
  controller configuration, exact on-chain quote/USDT settlement, and confirmations. It returns
  HTTP 200 with `SUBMITTED`, `CONFIRMED`, or `FAILED`; authoritative mismatches remain 4xx.
  Investors may submit `INVEST` and `TRANSFER` hashes. The token-owning Issuer may submit the new
  `redeem(investor, token, tokenAmount)` `REDEMPTION` hash.
- `GET /investments/transactions?page=1&limit=20&tokenUid=&type=ALL&status=ALL&walletAddress=&txHash=&fromDate=&toDate=&search=`
  returns role-scoped canonical history. Investor access is wallet-scoped; issuer access is
  organization-scoped; Super Administrator access is global.
- `GET /investments/transactions/export` accepts the same filters and exports the complete filtered
  result as CSV.

The `canonicalTransactions` checkpointed indexer independently finds confirmed controller
buy/redeem transactions and token transfers. The API is only the fast UI path; it is not required
for execution or recovery. See `docs/BLOCKCHAIN-TRANSACTION-INDEXER.md` and
`docs/FRONTEND-BLOCKCHAIN-TRANSACTION-GUIDE.md`.

## Investor token purchase (USDT)

- `GET /investments/me/portfolio?page=1&limit=20&search=` returns one row per token for which the
  authenticated investor has canonical confirmed investment, transfer, or redemption activity. Search covers token name, symbol,
  token address, and issuer company. Each row includes full marketplace token metadata, image URL,
  chain ID, issuer information, country restrictions, required claim topics, and portfolio totals.
  Totals are aggregated from canonical `blockchainTransaction` rows and include confirmed investments,
  redemptions, incoming/outgoing transfers, remaining net token amount, average purchase price, and activity dates.

- `GET /investments/tokens/{tokenUid}/purchases?page=1&limit=20&search=&status=all` returns the
  authenticated investor's legacy purchase history. It is retained read-only for production-data
  migration; new UI history must use `/investments/transactions?type=INVEST`.
- `GET /investments/purchases/{purchaseUid}` returns payment, mint, synchronization, errors, and
  append-only legacy transaction history.

The investor reads live USDT allowance, approves the Platform Controller when necessary, and calls
`PlatformController.buy()` directly. The controller atomically collects USDT and issues the token.
The old purchase create/confirm/retry POST endpoints and backend mint workers are retired.

## Token redemption

- `POST /investments/tokens/{tokenUid}/redemptions` creates the authoritative intent and returns an EIP-712 investor authorization payload.
- `POST /investments/redemptions/{redemptionUid}/authorize` verifies that the registered investor wallet signed the exact intent.
- Investor list/detail/cancel APIs and issuer list/detail/approve/reject APIs retain the off-chain
  request and review workflow. Issuer detail includes `investorName`.
- Issuer approval no longer queues a token lock. The issuer grants the Platform Controller reusable
  USDT allowance from the issuer wallet.
- After approval/funding, the investor calls `PlatformController.redeem()` directly. The controller
  atomically burns tokens and transfers issuer USDT to the investor.
- The matching legacy request becomes `COMPLETED` only after canonical verification/indexing.

The legacy redemption retry and issuer payment-confirm endpoints, platform lock/burn/unlock worker,
and backend USDT settlement are retired.

## Investor token transfer (ERC-3643)

- `GET /investments/transfers/{transferUid}` returns detail and append-only hash history to its sender
  or recipient for legacy rows.
- `GET /investments/tokens/{tokenUid}/transfers?page=1&limit=20&search=&status=all&direction=all`
  returns legacy sent/received history during migration.

The investor calls the ERC-3643 token `transfer()` directly and the contracts enforce eligibility,
restrictions, holding limits, pause/freeze rules, and identity state. The old transfer
create/confirm/retry POST endpoints and execution recovery workers are retired. New UI history uses
`/investments/transactions?type=TRANSFER`.

## Investor invitations

Issuer endpoints require an issuer JWT and an issuer-owned, deployed `tokenUid`:

- `GET /investments/issuer/investors?tokenUid={tokenUid}&page=1&limit=20&search=&invitationStatus=all`
  returns only active users whose investor profile is complete (`status = submitted`). Search covers
  investor name, email, wallet, and profile reference. `invitationStatus` supports `all`,
  `notInvited`, `PENDING`, `SENT`, and `VIEWED`. Every row contains profile/location/compliance
  details, top-level `accreditationType`, current invitation state, existing token-interest state,
  and `eligibleForInvitation`. `compliance.accreditationType` remains available for compatibility.
- `POST /investments/issuer/investors/{investorUid}/invitations` with
  `{ "tokenUid": "uuid" }` validates issuer ownership, approved organization, deployed token,
  completed investor profile, active email, token country rules, and absence of an existing
  investment interest. It creates the unique invitation before sending email.

The database uniqueness key is `(organizationUid, tokenUid, investorUid)`. Repeating an invitation
whose email was successfully sent returns the existing row with HTTP `200` and never sends a second
email. A failed delivery remains the same `PENDING` row with `emailStatus = FAILED`; retrying reuses
that row. A short `PROCESSING` lease also suppresses concurrent duplicate sends.

Investor endpoints require a completed investor profile:

- `GET /investments/me/invitations?page=1&limit=20&search=&status=all`
- `GET /investments/me/invitations/{invitationUid}`
- `PATCH /investments/me/invitations/{invitationUid}/viewed` with `{}`

Only successfully delivered invitations appear in the inbox. Responses include marketplace-equivalent
token detail (image URL, country restrictions, required claim topics) and issuer organization detail.
The viewed endpoint idempotently changes `SENT` to `VIEWED`. The email button points to
`{FRONTEND_URL}/app/marketplace/{tokenUid}`. See `docs/INVESTOR-INVITATIONS.md`.

## Status codes

- `200` success/update/delete; `201` created; `202` accepted/pending asynchronous confirmation
- `400` malformed request or invalid/expired one-time token
- `401` missing, invalid, expired, or stale JWT
- `403` inactive/unverified account, CORS denial, or missing permission
- `404` route/resource absent; `409` duplicate unique value
- `422` request validation; `429` rate limit; `500` database/unexpected failure
- `502` on-chain identity creation failed; the organization was not approved
