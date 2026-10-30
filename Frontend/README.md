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
- API-driven multichain MetaMask/WalletConnect flows with per-user network access and per-chain ONCHAINID state

## Multichain network access

`GET /api/v1/chains` is loaded before the wallet provider is created. Issuer and investor onboarding submit the selected `chainUid`, authenticated users can unlock additional networks from `/app/networks`, and token creation only exposes unlocked networks. Payment-token selection refreshes whenever the asset chain changes. Admins can manage network and payment-token catalogues from `/admin/networks`. Existing networks are never deleted from the admin UI: only Public RPC URL, Explorer URL, fallback internal RPC URLs, active/inactive state, and the network image can be changed after creation; chain-master changes remain tracked by the backend audit table. Payment-token purchase/redemption capabilities are omitted entirely from edit requests, and their creation controls are intentionally not exposed in the admin form. Network and payment-token images can be added on create or replaced later. The admin network screen uses responsive tabular management, custom styled search filters, a custom network selector for payment tokens, wide sectioned Add/Edit Network dialogs on larger screens, and a final read-only network review dialog before the create API is called.

## Authentication backend

Authentication requests use the API selected by the active frontend environment profile (`VITE_API_BASE_URL` + `VITE_API_VERSION`). The default local `.env` still points to the development backend, while `.env.testnet` and `.env.mainnet` provide explicit deployable profiles.

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

Organization onboarding integration is documented in [`docs/ORGANIZATION_BACKEND_INTEGRATION.md`](docs/ORGANIZATION_BACKEND_INTEGRATION.md). The current multichain frontend contract is documented in [`docs/FRONTEND_MULTICHAIN_INTEGRATION.md`](docs/FRONTEND_MULTICHAIN_INTEGRATION.md). Supported networks, public RPC metadata, chain contracts, payment tokens, confirmations, and per-user network access are loaded from the backend rather than frontend chain constants.

## Run locally

Use Node.js `22.22.1` or newer, add a WalletConnect project ID to `.env` or `.env.local` when QR/mobile wallet support is required, then run:

```bash
npm install
npm run dev
```

The frontend also has explicit browser-safe deployment profiles:

```bash
npm run dev:testnet
npm run dev:mainnet
npm run build:testnet
npm run build:mainnet
```

`.env.testnet` and `.env.mainnet` select frontend/API/branding settings. Platform-supported networks, public RPC metadata, chain contracts, compliance modules, confirmations, and platform payment tokens still come from `GET /api/v1/chains` and `GET /api/v1/chains/{chainUid}/config`. The only chain-specific frontend exception is the Wallet Management Circle bridge-only Ethereum profile described below; it does not make Ethereum a platform investment/deployment network.

`npm run build` and `npm run preview` default to the **mainnet** profile for production safety. Use `npm run build:testnet` / `npm run preview:testnet` explicitly for testnet deployments. The sidebar environment badge follows the currently selected backend chain (`isTestnet`) and only falls back to the deployment profile while chain data is not yet available.

### Wallet Management bridge-only Ethereum

Wallet Management keeps Circle USDC bridging independent from the platform network catalogue. The mainnet frontend adds Ethereum (chain `1`) and the testnet frontend adds Ethereum Network (chain `5042002`) only to Wallet Management balance reads, Wagmi wallet switching, and Circle Bridge Kit routes. These bridge-only networks never appear in the application network selector, network-access workflow, token creation, compliance, deployment, or investment-chain permissions.

The browser-safe values are configured per deployment profile with `VITE_BRIDGE_ETHEREUM_RPC_URL`, `VITE_BRIDGE_ETHEREUM_EXPLORER_URL`, and `VITE_BRIDGE_ETHEREUM_USDC_ADDRESS`. Mainnet uses Circle USDC on Ethereum and testnet uses Circle USDC on Ethereum Network. Override the public RPC in deployment configuration if a dedicated provider is required.

`npm install` generates the dependency lockfile for the newly added Wagmi, Viem, MetaMask Connect, and WalletConnect packages.

Production checks:

```bash
npm run lint
npm run build
```

The backend selected by the active environment profile must allow the frontend origin through CORS.

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
- Step 1 sends the selected unlocked `chainUid`, chain-scoped payment token, multipart token information, and validated token image to `/tokens/me/information`.
- Step 2 renders the claim topics returned by `/token-options` and submits their backend UIDs; Steps 3–4 save compliance rules and governance wallets.
- Step 5 calls `/tokens/me/submit` only after all earlier API saves, local validation, wallet authorization, and the wallet is on the token’s stored chain.

The current backend contract marks a successful submission as `readyToDeploy`; it does not yet return deployed smart-contract addresses. The UI therefore presents a truthful ready-to-deploy success state and keeps the submitted configuration read-only.

Bearer authentication continues through the centralized Axios interceptor. Multipart boundaries are left to the browser, backend field errors are mapped back to the relevant controls, request IDs are included in displayed API errors when available, and no access token or sensitive payload is logged by the token integration.

Token wizard values are kept only in memory while the current page session is active and are reset when the authenticated user changes. Refreshing or restarting the wizard always reloads the authoritative form from the backend.

## MetaMask deployment transport

Desktop MetaMask deployment uses the injected browser-extension provider. Public reads and transaction confirmation use the selected chain’s backend-provided public RPC, while signed writes stay in the wallet provider. The frontend switches/adds wallet networks from the chain catalogue and never uses an internal backend RPC URL.

## Investor dashboard live API

The Investor Dashboard now uses the authenticated investor profile, investment interests, invitation inbox, and deployed-token catalogue APIs instead of hardcoded dashboard records. Counts, statuses, recent rows, registered-asset state, profile/ONCHAINID details, and marketplace previews all come from current backend responses. Partial API failures preserve successfully loaded sections and expose a retry action.

See [`docs/INVESTOR_DASHBOARD_LIVE_API.md`](docs/INVESTOR_DASHBOARD_LIVE_API.md) for the exact dashboard data sources and state mapping.


## Multichain application network

Issuer and investor sessions now keep an explicit per-user active network. The header network selector lists the user's usable chain contexts and keeps wallet actions aligned with that selection. Account/onboarding chain data is preferred during initialization, while chain-specific token, investment, claim, redemption, registry, and deployment actions can temporarily establish the required chain explicitly. A connected wallet on another supported chain no longer causes the application to silently fall back to the platform default.

If the wallet is connected to a different chain than the selected application network, the header network control and wallet control expose a switch action. Unknown wallet chains are added with the public chain metadata loaded from `GET /api/v1/chains`; internal RPC URLs are never used by the wallet.

## Latest responsive admin/header refinements

- Payment-token deletion now uses an in-application confirmation dialog instead of the browser `confirm()` prompt. The dialog identifies the selected token/network, explains in-use backend protection, and keeps destructive/cancel actions usable on mobile.
- The authenticated Issuer/Investor header uses a compact single-row mobile layout for navigation, active network, wallet, and account controls. Network menus are viewport-anchored on small screens so they do not clip or overflow.

