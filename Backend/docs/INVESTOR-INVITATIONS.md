# Investor Invitation Flow

This module lets an issuer discover completed investor profiles and invite a specific investor to
review the issuer's deployed token. It is a discovery invitation only: accepting or viewing an
invitation does not create an investment interest, register an identity, or perform a blockchain
transaction.

## Database lifecycle

`investorInvitation` stores one row per `(organizationUid, tokenUid, investorUid)`.

```text
PENDING + emailStatus PROCESSING
          | SMTP accepted
          v
SENT + emailStatus SENT
          | investor opens invitation
          v
VIEWED + emailStatus SENT
```

If SMTP rejects delivery, the row remains `PENDING` with `emailStatus = FAILED`, the attempt count,
and the latest diagnostic. A retry claims and sends the same row. A successfully sent or viewed row
is returned idempotently and is never emailed again. A uniqueness key and row lock protect against
double-click and concurrent-request duplicates.

## Issuer APIs

### List completed investors

```http
GET /api/v1/investments/issuer/investors?tokenUid=02647af2-e585-4c03-8984-108e1e44c616&page=1&limit=20&search=&invitationStatus=all
Authorization: Bearer ISSUER_TOKEN
```

Only investor-role users with active, non-deleted, submitted profiles are returned. The API first
proves that `tokenUid` belongs to the authenticated issuer, the organization is approved and active,
and the token is deployed. It returns `accreditationType` as a top-level field on every investor row;
the field also remains in the `compliance` object for backward compatibility. Supported invitation
filters are `all`, `notInvited`, `PENDING`, `SENT`, and `VIEWED`.

Each investor row includes:

- identity, contact, location, compliance, wallet and ONCHAINID profile details;
- current invitation and email-delivery status;
- existing investment interest, if any;
- `eligibleForInvitation`, a stable eligibility code, and a display message.

The issuer UI should disable Invite when `eligibleForInvitation` is false. It may display Retry when
the invitation exists with `emailStatus = FAILED`.

### Send an invitation

```http
POST /api/v1/investments/issuer/investors/13a6332e-8909-4ced-9575-241dacc5c1d1/invitations
Authorization: Bearer ISSUER_TOKEN
Content-Type: application/json

{
  "tokenUid": "02647af2-e585-4c03-8984-108e1e44c616"
}
```

The backend does not accept issuer, organization, email, token address, investor wallet, or country
from the client. It resolves them from authenticated database state and validates:

1. issuer role and token ownership;
2. approved, active organization and deployed token;
3. completed, active investor profile with active user/email;
4. token allowlist/blocklist country rules;
5. no existing token investment interest;
6. no previously delivered invitation for the same organization/token/investor.

First successful send returns HTTP `201`. Repeating it returns HTTP `200` with
`alreadyExisted: true` and sends no email. A concurrent request may return
`processing: true` while the first SMTP delivery is in progress.

The HTML and plain-text email identify the company, issuer, token name and symbol. Its button is:

```text
{FRONTEND_URL}/app/marketplace/{tokenUid}
```

For the current frontend configuration this resolves to, for example:

```text
http://192.168.29.142:5173/app/marketplace/02647af2-e585-4c03-8984-108e1e44c616
```

## Investor APIs

### Invitation inbox

```http
GET /api/v1/investments/me/invitations?page=1&limit=20&search=&status=all
Authorization: Bearer INVESTOR_TOKEN
```

`status` supports `all`, `SENT`, and `VIEWED`. Search matches token name, symbol, and issuer company.
Only successfully emailed invitations are visible. Each row contains the invitation lifecycle,
marketplace URL, issuer organization detail, and the same marketplace token detail used by the token
detail API, including image URL, restrictions, and required claim topics.

### Detail and viewed acknowledgement

```http
GET /api/v1/investments/me/invitations/{invitationUid}
PATCH /api/v1/investments/me/invitations/{invitationUid}/viewed
Content-Type: application/json

{}
```

Both endpoints enforce investor ownership. Mark-viewed is idempotent and sets `viewedAt` only once.
Use it when the investor opens the invitation card or detail page; do not use a GET request to mutate
the state.

## Frontend sequence

Issuer:

1. Select/open the issuer token.
2. Load completed investors using that `tokenUid`.
3. Render eligibility and current invitation status per row.
4. On Invite, disable that row button while the POST is running.
5. Replace the row's invitation state from the response. Do not optimistically mark it sent.
6. If `INVITATION_EMAIL_FAILED`, show Retry; the backend will reuse the original row.

Investor:

1. Load the invitation inbox after login and on inbox refresh.
2. Render token and issuer data directly from the invitation response.
3. On card/detail open, call the viewed PATCH once; repeated calls are safe.
4. Navigate to the returned `marketplaceUrl` (or construct the same route from `token.tokenUid`).
5. Any later Submit Interest action continues through the existing marketplace investment flow.

## Migration and configuration

Apply:

```bash
mysql -u root trexCapitalMarket < database/migrations/20260910_add_investor_invitations.sql
```

Set `FRONTEND_URL` to the public frontend origin. SMTP uses the existing `SMTP_*` variables. The
migration adds the table and five RBAC permissions for issuer and investor roles.
