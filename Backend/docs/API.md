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

## Status codes

- `200` success/update/delete; `201` created
- `400` malformed request or invalid/expired one-time token
- `401` missing, invalid, expired, or stale JWT
- `403` inactive/unverified account, CORS denial, or missing permission
- `404` route/resource absent; `409` duplicate unique value
- `422` request validation; `429` rate limit; `500` database/unexpected failure
