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
- Backend-powered organization KYB onboarding with server drafts, location UIDs, UBOs, document vault and final submission
- Wagmi-powered MetaMask and WalletConnect organization wallet flow restricted to Sepolia testnet

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

Organization onboarding integration is documented in [`docs/ORGANIZATION_BACKEND_INTEGRATION.md`](docs/ORGANIZATION_BACKEND_INTEGRATION.md). Wallet setup, environment variables, and the backend wallet contract are documented in [`docs/WALLET_INTEGRATION.md`](docs/WALLET_INTEGRATION.md).

## Run locally

Use Node.js `22.22.1` or newer, add a WalletConnect project ID to `.env` when QR/mobile wallet support is required, then run:

```bash
npm install
npm run dev
```

`npm install` generates the dependency lockfile for the newly added Wagmi, Viem, MetaMask Connect, and WalletConnect packages.

Production checks:

```bash
npm run lint
npm run build
```

The browser running the frontend must be able to reach `192.168.29.90:3000`, and the backend must allow the frontend origin through CORS.

## Email verification links

Verification emails must link to the React route rather than directly to the JSON API. See `docs/EMAIL_VERIFICATION_FRONTEND_FLOW.md` for the required backend email URL and complete redirect flow.

## ERC-3643 Admin Review Panel

A dedicated role-protected compliance workspace is available under `/admin` for backend users whose normalized role is `admin`.

Key routes:

- `/admin/dashboard`
- `/admin/reviews`
- `/admin/organizations`
- `/admin/organizations/:organizationId`
- `/admin/users`
- `/admin/audit-logs`
- `/admin/settings`

See `docs/ADMIN_REVIEW_PANEL.md` for admin login steps, API contracts, mock-mode behavior, and production integration details.

## Admin review API update

The admin Review Queue and Organizations directory now use the real T-REX admin organization API with server-side status filtering, submission-date sorting, pagination, complete detail loading, and secure PATCH approval/rejection decisions. See `docs/ADMIN_BACKEND_REVIEW_INTEGRATION.md` for the exact request contract and environment setup.

## Token creation backend integration

The five-step token wizard is connected to the authenticated `/api/v1/tokens/me` workflow:

- `GET /token-options` and `GET /locations/countries` load backend claim topics and country UIDs.
- `GET /tokens/me` restores the current issuer token form and completed backend step. Browser-local token drafts are not used.
- Step 1 sends multipart token information and the validated token image to `/tokens/me/information`.
- Step 2 renders the claim topics returned by `/token-options` and submits their backend UIDs; Steps 3–4 save compliance rules and governance wallets.
- Step 5 calls `/tokens/me/submit` only after all earlier API saves, local validation, wallet authorization, and Sepolia checks pass.

The current backend contract marks a successful submission as `readyToDeploy`; it does not yet return deployed smart-contract addresses. The UI therefore presents a truthful ready-to-deploy success state and keeps the submitted configuration read-only.

Bearer authentication continues through the centralized Axios interceptor. Multipart boundaries are left to the browser, backend field errors are mapped back to the relevant controls, request IDs are included in displayed API errors when available, and no access token or sensitive payload is logged by the token integration.

Token wizard values are kept only in memory while the current page session is active and are reset when the authenticated user changes. Refreshing or restarting the wizard always reloads the authoritative form from the backend.

## MetaMask deployment transport

Desktop MetaMask deployment uses the injected browser-extension provider. Public Sepolia reads and transaction confirmation use the configured RPC, while only signed writes use the wallet provider. See `docs/METAMASK_TRANSPORT_TIMEOUT_FIX.md`.
