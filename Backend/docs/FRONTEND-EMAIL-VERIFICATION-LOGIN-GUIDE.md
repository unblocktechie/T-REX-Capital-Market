# Frontend Email Verification and Automatic Login Guide

## Contract

The email continues to link to the frontend only:

```text
/verify-email?token=<64-character-token>
```

Do not call the backend from the email URL itself. The verification page should show a
**Verify and continue** button so email scanners cannot consume the link or create a login
session merely by opening it.

When the user clicks the button, call:

```http
POST /api/v1/auth/verify-email
Content-Type: application/json

{
  "token": "<token from the URL>"
}
```

Successful verification returns the same session structure as password login:

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
      "fullName": "Nemish Rupapara",
      "email": "nemish@example.com",
      "roleName": "Investor",
      "emailVerified": true
    }
  }
}
```

## Page states

Use an explicit state machine instead of deriving UI from several booleans:

```text
READY       -> show Verify and continue
VERIFYING   -> disable the button and show Verifying email...
SUCCESS     -> show Email verified — redirecting...
INVALID     -> show Invalid or expired verification link
INACTIVE    -> show Account inactive; contact support
FAILED      -> show a retryable generic error
```

On page load:

1. Read `token` from `URLSearchParams`.
2. Validate that it contains 64 hexadecimal characters before enabling the button.
3. Do not store the verification token in the authentication store or browser storage.
4. Do not make the verification request until the user clicks **Verify and continue**.

## React-style implementation

Adapt the store and route names to the frontend's existing authentication implementation:

```javascript
const token = new URLSearchParams(window.location.search).get('token');
const tokenIsValid = /^[A-Fa-f0-9]{64}$/.test(token ?? '');

async function verifyAndContinue() {
  if (!tokenIsValid || state === 'VERIFYING') return;
  setState('VERIFYING');

  try {
    const response = await api.post('/api/v1/auth/verify-email', { token });
    const session = response.data.data;

    authStore.setSession({
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      expiresIn: session.expiresIn,
      user: session.user,
    });

    setState('SUCCESS');
    navigate(resolveAuthenticatedLandingRoute(session.user.roleName), { replace: true });
  } catch (error) {
    const status = error.response?.status;
    if (status === 400 || status === 422) setState('INVALID');
    else if (status === 403) setState('INACTIVE');
    else setState('FAILED');
  }
}
```

Keep role routing centralized and reuse the same resolver used after password login:

```javascript
function resolveAuthenticatedLandingRoute(roleName) {
  if (roleName === 'Investor') return '/app/marketplace';
  if (roleName === 'Issuer') return '/app';
  return '/app';
}
```

## Authentication integration

- Use the same `setSession` action used by the normal login page.
- Ensure the API client's Authorization interceptor reads the newly stored token.
- Replace browser history during redirect so Back does not return to a consumed link.
- Remove the token query string from visible history after success.
- Do not call `/auth/login`; verification already returns a complete authenticated session.
- If the API returns `400`, offer **Resend verification** and **Go to login** actions.
- If it returns `403`, do not retry automatically and do not store any session data.
- Prevent double-clicks while `VERIFYING`; the backend token is intentionally one-time use.

## Important compatibility change

The old endpoint is removed:

```text
GET /api/v1/auth/verify-email?token=...
```

Any frontend code calling that URL directly must be changed to the POST body contract above.
