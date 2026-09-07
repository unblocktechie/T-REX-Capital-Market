# Frontend email-verification flow

The verification button inside the email must open the React application, not the backend API response page.

## Required verification URL

For local LAN development, generate this link in the backend email template:

```text
http://192.168.29.90:5173/verify-email?token=<verification-token>
```

For deployment, replace the origin with the public HTTPS frontend origin:

```text
https://your-frontend-domain.com/verify-email?token=<verification-token>
```

Do **not** use this URL in the email:

```text
http://192.168.29.90:3000/api/v1/auth/verify-email?token=<verification-token>
```

That URL is the JSON API called by the React verification page after it opens.

## Backend link-generation pattern

Use the actual configuration name used by the backend project. The implementation should follow this pattern:

```js
const frontendOrigin = process.env.FRONTEND_URL;
const verificationUrl = `${frontendOrigin}/verify-email?token=${encodeURIComponent(token)}`;
```

Recommended development configuration:

```env
FRONTEND_URL=http://192.168.29.90:5173
```

The same rule should be used for password-reset emails:

```js
const resetUrl = `${frontendOrigin}/reset-password?token=${encodeURIComponent(token)}`;
```

## Runtime sequence

1. The user clicks the email button.
2. The browser opens `/verify-email?token=...` in the React application.
3. The page displays the responsive T-REX secure loader.
4. React calls `GET http://192.168.29.90:3000/api/v1/auth/verify-email?token=...`.
5. On success, the page displays a confirmation animation briefly.
6. The browser automatically redirects to `/login?verified=true`.
7. The sign-in page confirms that the email is verified.

## LAN access

Vite is configured with `host: true`, so the development application can be opened by other devices on the same network at `http://192.168.29.90:5173`, provided the machine firewall allows port `5173`.
