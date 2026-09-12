# Authentication and Privy rate-limit recovery

The authentication flow now preserves progress across temporary HTTP `429`, Privy, wallet-provisioning, and RPC interruptions instead of forcing the user to restart the flow.

## Recovery behavior

- Backend API `429` responses are retried up to three times with exponential backoff and `Retry-After` support.
- Privy OTP send/verify calls retry only confirmed rate-limit responses. Stateful calls are not blindly replayed after ambiguous network failures.
- Privy identity-token reads retry transient failures and short token-readiness delays.
- Embedded-wallet creation is single-flight. After creation, the frontend waits for the wallet to propagate into the Privy identity token rather than immediately calling `createWallet` again.
- If OTP verification succeeds but wallet creation or backend session completion fails, the login/signup page preserves that progress and exposes **Resume secure sign in/setup**. The OTP is not consumed a second time.
- If code delivery fails after the backend password step succeeds, the login UI stays on the OTP step so **Resend Privy code** does not re-run the password-login API.
- Wallet chain/balance refreshes are shared across mounted wallet controls, cached briefly, and retried for transient read failures. This reduces duplicate public RPC traffic.
- `PrivyProvider` and `QueryClientProvider` sit outside React development `StrictMode`, preventing development-only double mounting from duplicating SDK initialization requests. Application components still run under StrictMode.

## Files

- `src/utils/retry.js`
- `src/api/axios/interceptors.js`
- `src/hooks/usePrivyEmailAuth.js`
- `src/hooks/useWalletConnection.js`
- `src/pages/auth/LoginPage.jsx`
- `src/pages/auth/VerifyEmailPage.jsx`
- `src/pages/auth/SignupPage.jsx`
- `src/components/auth/AuthRecoveryNotice.jsx`
- `src/main.jsx`
- `src/utils/error.js`

No existing onboarding layout or responsive breakpoint was replaced; recovery UI uses the same Tailwind design tokens and fluid width constraints as the current authentication screens.
