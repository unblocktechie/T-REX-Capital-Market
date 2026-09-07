# End-to-end testing guide

The examples use `curl` and assume `BASE_URL=http://localhost:3000`. JSON responses shown are abbreviated; all responses include `success`, `message`, `timestamp`, and `requestId`.

## 1. Install, configure, and start

```bash
npm install
copy .env.example .env
mysql -u root -p < database/trex-capital-market.sql
npm run seed:admin
npm run check
npm test
npm run dev
```

For an existing database, run `mysql -u root -p trexCapitalMarket < database/migrations/20260907_add_issuer_investor_roles.sql` before starting the updated API.

Expected startup log: `T-REX Capital Market Backend started`. If environment validation, MySQL, or SMTP configuration is invalid, startup fails clearly.

## 2. Health check

```bash
curl http://localhost:3000/api/health
```

Expected: HTTP `200`, `data.status` is `UP`, and UTC `data.utcTimestamp` is present.

## 3. Signup

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup -H "Content-Type: application/json" -d '{"fullName":"Ada Lovelace","email":"ada@example.com","password":"Launch!234","isIssuer":false}'
```

Expected: HTTP `201`, a user UUID with Investor `roleUid` (`00000000-0000-4000-8000-000000000004`), `emailVerified: false`, and no password/hash in the response. Repeat with `isIssuer: true` to confirm Issuer assignment.

## 4. Receive and verify email

Open the email delivered by the configured SMTP server. Click **Verify email**, or copy its API link:

```bash
curl "http://localhost:3000/api/v1/auth/verify-email?token=TOKEN_FROM_EMAIL"
```

Expected: HTTP `200`, `emailVerified: true`, and `emailVerifiedAt`. Reusing the link returns `400`.

## 5. Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"Launch!234"}'
```

Expected: HTTP `200` with a Bearer JWT. Before verification, the same call returns `403` and `Please verify your email before logging in.`

## 6. Obtain the administrator token

Use the administrator created by `npm run seed:admin`:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"ReplaceMe123!"}'
```

Save `data.accessToken` as `ADMIN_TOKEN`. Use the real values from `.env`.

## 7. Access a protected API

```bash
curl "http://localhost:3000/api/v1/roles?page=1&limit=20&sortBy=roleName&sortOrder=asc" -H "Authorization: Bearer ADMIN_TOKEN"
```

Expected: HTTP `200`, seeded roles, and pagination metadata. Missing JWT returns `401`.

## 8. Confirm permission authorization

Call `/api/v1/menus` with Ada's Investor token. The seeded Investor permission should return `200`. Call `/api/v1/roles` with the same token.

Expected: menu read returns `200`; role administration returns HTTP `403`, code `FORBIDDEN`. Issuer accounts have the same least-privilege menu-read baseline. Use the administrator token to add further API permissions when the product introduces issuer- or investor-specific protected endpoints.

## 9. Forgot password

```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"ada@example.com"}'
```

Expected for a registered active account: HTTP `200` and a reset email. An unregistered email returns HTTP `404` with `This email is not registered. Please sign up first.` An inactive account returns HTTP `403`.

## 10. Validate and reset

```bash
curl "http://localhost:3000/api/v1/auth/verify-reset-token?token=TOKEN_FROM_EMAIL"
curl -X POST http://localhost:3000/api/v1/auth/reset-password -H "Content-Type: application/json" -d '{"token":"TOKEN_FROM_EMAIL","newPassword":"NewLaunch!567"}'
```

Expected: token validation `200`, reset `200`, then token reuse `400`.

## 11. Log in with the new password

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"NewLaunch!567"}'
```

Expected: HTTP `200`. The old password returns `401`.

## 12. Role CRUD

```bash
curl -X POST http://localhost:3000/api/v1/roles -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"roleName":"Operations","description":"Launch operations","isActive":true}'
curl -X PUT http://localhost:3000/api/v1/roles/ROLE_UID -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"description":"Updated operations team"}'
curl http://localhost:3000/api/v1/roles/ROLE_UID -H "Authorization: Bearer ADMIN_TOKEN"
curl -X DELETE http://localhost:3000/api/v1/roles/ROLE_UID -H "Authorization: Bearer ADMIN_TOKEN"
```

Expected: `201`, `200`, `200`, `200`; a subsequent get returns `404`.

## 13. Menu CRUD

Repeat create/list/get/update/delete on `/api/v1/menus` using:

```json
{ "menuName": "Launches", "menuCode": "LAUNCHES", "routePath": "/launches", "displayOrder": 10, "isVisible": true, "isActive": true }
```

Expected: the same CRUD status sequence. Confirm `?search=Launch&isVisible=true&sortBy=displayOrder` filters the list.

## 14. Permission CRUD

Repeat CRUD on `/api/v1/permissions` using:

```json
{ "roleUid": "ROLE_UID", "menuUid": "MENU_UID", "permissionName": "List launches", "permissionCode": "LAUNCH_LIST", "httpMethod": "GET", "apiPath": "/api/v1/launches", "isAllowed": true, "isActive": true }
```

Expected: the permission becomes effective on the next matching request; no service restart is needed.

## 15. General-settings CRUD

Repeat CRUD on `/api/v1/general-settings` using:

```json
{ "settingKey": "application.pageSize", "settingValue": "25", "valueType": "number", "settingGroup": "application", "isPublic": true, "isActive": true }
```

Then call:

```bash
curl http://localhost:3000/api/v1/general-settings/public
```

Expected: `application.pageSize` is returned as number `25`. After soft delete or `isPublic: false`, it is absent.
