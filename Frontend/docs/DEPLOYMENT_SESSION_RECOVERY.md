# Deployment session recovery

## Problem handled

A Sepolia deployment can be confirmed while the web access token expires before
`POST /tokens/me/submit` stores the transaction hash. The issuer has already paid gas,
so starting another deployment would create a duplicate token suite.

## Recovery flow

1. As soon as MetaMask broadcasts `deployTREXSuite`, the frontend stores only the transaction
   hash, issuer user key, approved issuer wallet, Sepolia chain ID, and minimal token display
   metadata.
2. After the receipt succeeds and the `TREXSuiteDeployed` event is found, the same recovery
   record is marked confirmed. Both writes happen before the second MetaMask request and before
   the authenticated backend submit request.
3. When a `401` redirects the user to sign in, the recovery record remains in browser storage.
4. After the same issuer signs in, the app opens the deployment page in backend-sync mode.
5. Before resubmitting, the frontend waits for confirmation when necessary and verifies on
   Sepolia that:
   - the receipt succeeded;
   - the transaction targeted the configured T-REX Gateway;
   - the transaction sender matches the approved issuer wallet; and
   - the configured Factory emitted `TREXSuiteDeployed` in that receipt.
6. The app retries only `POST /tokens/me/submit` with the existing hash. MetaMask is not
   opened and no new gas is charged.
7. The recovery record is removed only after the backend acknowledges the hash.

The recovery record expires after 30 days and contains no private key, signature, access token,
or other wallet secret.

## Backend requirement

`POST /tokens/me/submit` should be idempotent by transaction hash. The backend should also
verify the Sepolia receipt and deployed suite before updating the Token table. Repeating the
same confirmed hash should return success or the existing deployment record rather than create
a second database record.
