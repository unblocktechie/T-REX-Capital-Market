# Admin Organization Review Backend Integration

The admin review workspace is connected to the organization-review endpoints in the supplied T-REX Capital Market Postman collection.

## Authentication and authorization

1. Administrators sign in through `POST /api/v1/auth/login`.
2. The existing auth mapper recognizes either `roleName: "admin"` or the configured admin role UID.
3. The access token is stored through the existing session service and added as `Authorization: Bearer <token>` by the Axios interceptor.
4. All `/admin/*` routes remain protected by `AuthMiddleware` and `RoleMiddleware`.
5. A `401` response clears the expired session and redirects to login.

## Supported organization review endpoints

```text
GET   /api/v1/admin/organizations
GET   /api/v1/admin/organizations/:organizationUid
PATCH /api/v1/admin/organizations/:organizationUid/status
```

### List query parameters

The frontend sends only parameters documented for the backend endpoint:

```text
page
limit
status
sortBy=submittedAt
sortOrder=asc|desc
```

The organization-name/registration/wallet search in the column header is intentionally applied to the currently loaded page because the provided admin organization endpoint does not document a `search` query parameter.

### Approval body

```json
{
  "status": "approved"
}
```

### Rejection body

```json
{
  "status": "rejected",
  "rejectionReason": "Document verification failed: Replace the expired incorporation certificate."
}
```

Only the supported decision fields are sent. Reviewer assignment, document-level approval, internal notes, and request-more-information controls are not shown in the real organization review screen because the supplied backend collection does not expose those admin endpoints.

## Response mapping

The frontend adapter safely maps common backend field variants for:

- organization UID
- legal company name
- registration number
- status
- submitted and updated dates
- country and jurisdiction
- entity type
- tax identification number
- industry and business activity
- wallet address and network
- beneficial owners
- uploaded document metadata
- rejection reason
- pagination from `meta.pagination`

The grid intentionally displays only fields required for queue navigation:

- Organization
- Submission date
- Status
- Organization wallet
- View action

Full information is loaded only after opening the organization review page.

## Environment

```env
VITE_API_BASE_URL=http://192.168.29.90:3000/api
VITE_API_VERSION=v1
VITE_USE_MOCK_API=false
VITE_ENABLE_DARK_MODE=false
```

Change the API host to the address used by the backend server. Do not append `/v1` to `VITE_API_BASE_URL`; the frontend adds `VITE_API_VERSION` automatically.

## Secure admin document preview and download

The organization review document viewer uses authenticated binary requests through the existing Axios client, so the administrator bearer token is attached by the shared interceptor.

```text
GET /api/v1/admin/organizations/:organizationUid/documents/:documentUid/file?disposition=inline
GET /api/v1/admin/organizations/:organizationUid/documents/:documentUid/file?disposition=attachment
```

The inline response is converted to a temporary browser object URL for image/PDF review and revoked when the viewer closes. The attachment response is downloaded using the filename supplied in `Content-Disposition`.
