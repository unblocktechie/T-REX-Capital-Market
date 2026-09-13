# Token creation wallet hydration fix

## Issue

When the issuer confirmed token creation, the deployment route mounted a fresh
`useWalletConnection()` instance. Its `chainId` state initially started as
`undefined` while the Privy embedded-wallet provider snapshot was still loading.

`DeploymentProcessingPage` could begin its one-shot deployment effect during that
short initialization window and evaluate `wallet.isCorrectNetwork` as `false`.
That produced the misleading message that the Privy secure account needed a
setup check. By the time the user clicked **Try token creation again**, the wallet
snapshot had finished loading, so the exact same flow continued successfully.

## Fix

- `useWalletConnection` now exposes an `isReady` signal that becomes true only
  after Privy/wallet discovery is ready and the current embedded wallet has
  completed its first provider snapshot.
- `DeploymentProcessingPage` waits for this readiness signal before starting its
  one-shot deployment attempt.
- Existing deployment recovery/idempotency checks and transaction safeguards are
  unchanged; the fix only removes the false initial network failure caused by
  route-level wallet hydration timing.

## Expected behavior

After **Confirm and Create Asset**, the deployment screen can briefly remain on
its normal preparation state while Privy wallet state is hydrated, then proceeds
automatically. The user should no longer need to press **Try token creation
again** solely because the route mounted before `chainId` was available.
