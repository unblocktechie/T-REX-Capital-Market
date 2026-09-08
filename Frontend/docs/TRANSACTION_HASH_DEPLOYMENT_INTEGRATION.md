# Transaction-hash deployment integration

## Backend contract

After the Sepolia deployment transaction is confirmed, the frontend calls:

```http
POST /tokens/me/submit
Content-Type: application/json
```

```json
{
  "transactionHash": "0x...64 hexadecimal characters..."
}
```

The frontend validates the hash before making the request. The backend is expected to:

1. Validate the authenticated issuer and token-proposal ownership.
2. Validate the transaction-hash format and Sepolia chain.
3. Fetch and verify the confirmed transaction receipt.
4. Verify that the receipt targets the configured T-REX Gateway.
5. Parse `TREXSuiteDeployed` and store the suite contract addresses.
6. Store the transaction hash and mark the Token record as deployed.
7. Return a successful HTTP `2xx` response after the update is committed.
8. Treat retries with the same token and transaction hash as idempotent.

The backend does not have to echo the transaction hash in the response body. The frontend keeps the
confirmed on-chain hash as the authoritative value. When the backend does return a valid
`transactionHash` or `deployTx`, the frontend verifies that it matches the confirmed wallet
transaction before opening the success page.

## Request ordering

- Existing token form endpoints continue to save each wizard step.
- No submit request is made when the confirmation popup opens.
- No submit request is made before the blockchain transaction is confirmed.
- `POST /tokens/me/submit` is the only post-deployment write and receives only the confirmed hash.
- If the backend request fails after confirmation, retrying repeats only the backend call. It never
  invokes `deployTREXSuite` again.
- No extra token-status GET request is required to accept a successful `2xx` submit response.

## Success-page security

The success route renders only when:

- the current completed deployment state contains the valid confirmed transaction hash, or
- the backend Token record contains a valid deployment transaction hash.

A `readyToDeploy` status without a confirmed hash redirects back to Review & Deploy and cannot show
a false success state.
