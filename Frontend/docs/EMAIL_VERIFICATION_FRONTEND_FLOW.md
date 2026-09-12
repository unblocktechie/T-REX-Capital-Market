# Frontend email-verification flow

The verification button inside the email must open the React application only. Opening the email URL must not verify the account or create a login session.

## Required verification URL

Use the public frontend origin:

```text
https://your-frontend-domain.com/verify-email?token=<64-character-verification-token>
```

For local/LAN development, use the matching frontend development origin instead.

Do **not** place the API endpoint in the email button. The frontend sends the verification request only after the user explicitly selects **Verify and continue**.

## Backend link-generation pattern

Use the actual frontend-origin configuration used by the backend project:

```js
const frontendOrigin = process.env.FRONTEND_URL;
const verificationUrl = `${frontendOrigin}/verify-email?token=${encodeURIComponent(token)}`;
```

The same frontend-origin rule applies to password-reset links.

## Verification API contract

After the user clicks **Verify and continue**, the frontend sends:

```http
POST /api/v1/auth/verify-email
Content-Type: application/json
```

```json
{
  "token": "<64-character-verification-token>"
}
```

The old `GET /api/v1/auth/verify-email?token=...` contract is not used.

A successful response returns the same session structure as password login. The frontend normalizes and stores the returned access token and user through the shared authentication session action.

## Runtime sequence

1. The user opens `/verify-email?token=...` from the email.
2. React reads the token from `URLSearchParams` and validates it locally as exactly 64 hexadecimal characters.
3. No verification API request is made on page load.
4. The page displays **Verify and continue**.
5. The user clicks the button; duplicate clicks are blocked while the request is in progress.
6. React sends `POST /api/v1/auth/verify-email` with only `{ "token": "..." }`.
7. On success, the returned login session is stored using the same session path as password login.
8. The token query string is removed from visible history.
9. The page briefly shows **Email verified — redirecting…** and navigates with `replace` to the authenticated role landing route.
10. Issuer/investor route guards continue to enforce any required onboarding before the workspace is opened.

## UI state mapping

- `READY` — valid local token; show **Verify and continue**.
- `VERIFYING` — disable the CTA and show **Verifying email…**.
- `SUCCESS` — session stored; show **Email verified — redirecting…**.
- `INVALID` — malformed token or HTTP `400`/`422`; offer resend verification and sign in.
- `INACTIVE` — HTTP `403`; show an inactive-account message and do not retry automatically.
- `FAILED` — temporary/unexpected failure; show a generic retry action.

The verification token is never written to local storage, session storage, or the authentication store.
