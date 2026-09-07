# T-REX Capital Market UI

A responsive React application for issuers and investors to access compliant digital-security workflows powered by the T-REX ecosystem and ERC-3643 architecture.

## Highlights

- Unified T-REX product identity across authentication and the application
- Complete light and dark themes with saved user preference
- Separate issuer and investor signup journeys
- Backend-powered signup, email verification, login, forgot-password and reset-password flows
- JWT bearer authentication for protected API requests
- Session restoration, JWT expiry handling, automatic `401` logout and protected routes
- Responsive layouts for desktop, laptop, tablet, mobile and narrow mobile screens
- Guided issuer dashboard, identity, compliance and investor-management modules

## Authentication backend

Authentication requests use:

```text
http://192.168.29.90:3000/api/v1
```

The signup form sends the backend contract defined in the supplied Postman collection:

```json
{
  "fullName": "Alex Morgan",
  "email": "alex@example.com",
  "password": "Password@123",
  "isIssuer": true
}
```

For an investor account, `isIssuer` is `false`.

See [`docs/AUTH_BACKEND_INTEGRATION.md`](docs/AUTH_BACKEND_INTEGRATION.md) for endpoint, token-storage, CORS and email-link details.

## Run locally

Use Node.js `22.22.1` or newer, then run:

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

The browser running the frontend must be able to reach `192.168.29.90:3000`, and the backend must allow the frontend origin through CORS.

## Email verification links

Verification emails must link to the React route rather than directly to the JSON API. See `docs/EMAIL_VERIFICATION_FRONTEND_FLOW.md` for the required backend email URL and complete redirect flow.
