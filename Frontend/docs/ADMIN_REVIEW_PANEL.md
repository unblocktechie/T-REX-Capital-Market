# ERC-3643 Admin Review Panel

## Admin login

The admin panel uses the existing protected login endpoint and JWT/session flow. There is no separate client-side admin password or bypass.

1. The backend creates an active user with an administrator role. The login response or JWT must identify the role as `admin`, or use the configured admin role UID `00000000-0000-4000-8000-000000000001`.
2. Open `/login` and sign in with that administrator email and password.
3. `normalizeAuthSession` maps the backend role and assigns the admin permissions.
4. After successful authentication, the frontend redirects the user to `/admin/dashboard`.
5. `AuthMiddleware` verifies the session and `RoleMiddleware` prevents non-admin roles from opening `/admin/*` routes.

Issuers and investors continue to use the same login page and are routed to their existing workspace.

## Development preview

The current `.env` uses the real backend adapter:

```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://192.168.29.90:3000/api
VITE_API_VERSION=v1
```

Change the host to match the backend deployment. Mock mode remains available only for isolated UI development.

The authentication endpoint remains:

```text
POST /auth/login
```

Expected successful response fields:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "userUid": "...",
    "fullName": "Compliance Admin",
    "email": "admin@example.com",
    "roleName": "admin"
  }
}
```

## Admin API contract

When mock mode is disabled, the organization review UI calls only the endpoints supplied in the backend collection:

- `GET /admin/organizations`
- `GET /admin/organizations/:organizationUid`
- `PATCH /admin/organizations/:organizationUid/status`

The list request sends `page`, `limit`, `status`, `sortBy=submittedAt`, and `sortOrder`. Approval sends `{ "status": "approved" }`. Rejection sends `{ "status": "rejected", "rejectionReason": "..." }`.

Dashboard counts are derived securely by calling the list endpoint with each supported status. Unsupported mock-only review actions are not shown on the real organization detail page.

Every protected endpoint uses the existing Axios bearer-token interceptor. The backend must independently enforce the administrator role and permissions; frontend route guards are a UX layer, not the security boundary.

## Routes

- `/admin/dashboard`
- `/admin/reviews`
- `/admin/organizations`
- `/admin/organizations/:organizationId`
- `/admin/users`
- `/admin/audit-logs`
- `/admin/settings`
- `/admin/profile`
- `/admin/documentation`
- `/admin/security-logs`

## UI architecture

The admin interface is isolated from the issuer layout:

- `src/layouts/admin/AdminLayout.jsx`
- `src/layouts/admin/AdminHeader.jsx`
- `src/layouts/admin/AdminSidebar.jsx`
- `src/pages/admin/*`
- `src/components/admin/*`
- `src/api/admin/*`

All new admin UI is implemented with Tailwind CSS and Framer Motion. Existing issuer organization logic, wallet flow, routes, APIs, and styles remain unchanged.
