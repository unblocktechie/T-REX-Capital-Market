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

Organization onboarding is available only to authenticated users whose role is `Issuer`. One issuer owns one organization form. Every section save remains a draft; only `POST /organizations/me/submit` changes it to `submitted`.

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
      "ownershipPercentage": 45,
      "isPrimary": true
    },
    {
      "fullName": "John Doe",
      "dateOfBirth": "1980-03-11",
      "nationalityCountryUid": "<countryUid>",
      "ownershipPercentage": 30,
      "isPrimary": false
    }
  ],
  "isDraft": false
}
```

Up to 20 owners can be stored. A completed section requires at least one adult owner, each declared owner must hold at least 25%, the total cannot exceed 100%, and no more than one owner can be primary. Saving replaces the current owner list atomically.

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

`walletAddress` is required and must be a valid EVM address (`0x` followed by 40 hexadecimal characters). Final submission saves it on the organization and revalidates every required company and jurisdiction field, location hierarchy, entity/industry references, owners, and every required document type. A successful response sets `isDraft: false`, `status: submitted`, `currentStep: completed`, and `submittedAt`. Submitted forms are read-only.

## Status codes

- `200` success/update/delete; `201` created
- `400` malformed request or invalid/expired one-time token
- `401` missing, invalid, expired, or stale JWT
- `403` inactive/unverified account, CORS denial, or missing permission
- `404` route/resource absent; `409` duplicate unique value
- `422` request validation; `429` rate limit; `500` database/unexpected failure
