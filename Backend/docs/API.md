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

Always returns a generic `200` response. Any previous unused verification link is revoked.

### `GET /auth/verify-email?token=<64-hex-character-token>`

Returns the user with `emailVerified: true` and `emailVerifiedAt`. The link becomes unusable after success.

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

`walletAddress` is required and must be a valid EVM address (`0x` followed by 40 hexadecimal characters). Final submission saves it on the organization and revalidates every required company and jurisdiction field, location hierarchy, entity/industry references, owners, and every required document type. An initial submission sets `status: submitted`; the allowed revised submission sets `status: resubmitted`. Both set `isDraft: false`, `currentStep: completed`, and `submittedAt`.

## Token creation

Token creation requires an authenticated Issuer with an approved organization and valid organization `walletAddress`. One token row is uniquely bound to one organization. After the token becomes `readyToDeploy` or `deployed`, issuer edits are rejected; the organization cannot create another token. A `deploymentFailed` token remains eligible for another verified deployment submission.

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
  "tokenAgentWalletAddress": "0x1111111111111111111111111111111111111111",
  "identityManagerWalletAddress": "0x1111111111111111111111111111111111111111",
  "isDraft": false
}
```

Both addresses must be valid EVM addresses and must match the approved organization's `walletAddress` case-insensitively.

### `POST /tokens/me/submit`

The frontend deploys the TREX suite first, waits for the wallet transaction, and submits its hash:

```json
{
  "transactionHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

The backend revalidates all completed sections, active claims/countries, the optimized image, trusted issuer, token agent, and identity manager. It then waits for the configured confirmation count, requires a successful receipt, accepts `TREXSuiteDeployed` only from `TREX_FACTORY_ADDRESS`, resolves the block timestamp, and saves:

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

Approval first checks the configured Sepolia OnchainID factory for the organization's submitted `walletAddress`. If no identity exists, the API creates one with the deterministic salt `org-{organizationUid}` and waits for the configured confirmations. A successful response includes:

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

## Status codes

- `200` success/update/delete; `201` created
- `400` malformed request or invalid/expired one-time token
- `401` missing, invalid, expired, or stale JWT
- `403` inactive/unverified account, CORS denial, or missing permission
- `404` route/resource absent; `409` duplicate unique value
- `422` request validation; `429` rate limit; `500` database/unexpected failure
- `502` on-chain identity creation failed; the organization was not approved
