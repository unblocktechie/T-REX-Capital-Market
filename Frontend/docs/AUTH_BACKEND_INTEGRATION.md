# T-REX Authentication Backend Integration

The frontend authentication flow now uses the backend at:

```text
http://192.168.29.90:3000/api/v1
```

## Integrated endpoints

- `POST /auth/signup`
- `POST /auth/resend-verification`
- `POST /auth/verify-email` with `{ "token": "..." }`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `GET /auth/verify-reset-token?token=...`
- `POST /auth/reset-password`

## Request mapping

The signup form maps its fields to the backend request:

```json
{
  "fullName": "User Name",
  "email": "user@example.com",
  "password": "StrongPassword!123",
  "isIssuer": true
}
```

The reset form sends:

```json
{
  "token": "token-from-email",
  "newPassword": "NewStrongPassword!123"
}
```

## Session behavior

- The JWT is attached as `Authorization: Bearer <token>` for protected API requests.
- By default, the session is stored in `sessionStorage` and ends when the browser session closes.
- When **Keep me signed in** is selected, the session is stored in `localStorage`.
- JWT expiry is checked during application startup.
- Protected API responses with status `401` clear the session and redirect to sign in.
- Passwords and reset/verification tokens are never persisted by the frontend.

## Backend requirements

The backend must allow the frontend origin through CORS, including the `Authorization` and `Content-Type` headers. For production, replace the private HTTP address with an HTTPS API URL. Browsers block an HTTP API when the frontend itself is served over HTTPS.

## Email links

Verification emails should open the frontend route with the token:

```text
https://your-frontend-domain/verify-email?token=TOKEN&email=user@example.com
```

Password-reset emails should open:

```text
https://your-frontend-domain/reset-password?token=TOKEN
```

## Verification-page authentication flow

The verification email opens only the frontend route `/verify-email?token=...`. Opening the URL does not call the API. The page first validates that the token is 64 hexadecimal characters and shows **Verify and continue**. Only a user click sends `POST /api/v1/auth/verify-email` with `{ "token": "..." }`.

A successful verification response contains the same authenticated session shape as password login. The frontend stores that session through the shared authentication store, removes the one-time token from visible browser history, and redirects with history replacement to the authenticated workspace. It does not call `/auth/login` after verification.

The API URL itself must not be used as the email button URL because email scanners or link previews must not be able to consume the one-time token. Backend email-link setup is documented in `EMAIL_VERIFICATION_FRONTEND_FLOW.md`.

## Authentication `404` behavior

When an account-dependent authentication endpoint returns HTTP `404`, the frontend redirects the user to:

```text
/signup?reason=account-not-found
```

The signup page then displays a request-specific, user-friendly **Account not found** message. When the failed request contained an email address, that email is securely carried through `sessionStorage` and prefilled on the signup form. The signup endpoint itself is excluded from this redirect to prevent redirect loops and to preserve genuine backend route errors.
