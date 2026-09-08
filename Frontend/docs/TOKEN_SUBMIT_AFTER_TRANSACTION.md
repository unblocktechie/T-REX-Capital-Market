# Token submit sequencing

The final token deployment flow is intentionally hash-driven:

1. The user confirms the deployment in the frontend.
2. The frontend validates the connected wallet, approved issuer wallet, and Sepolia chain.
3. The issuer signs `deployTREXSuite` through the connected wallet.
4. The frontend waits for a successful Sepolia receipt and validates the returned transaction hash.
5. Only then does the frontend call `POST /tokens/me/submit` with:

```json
{
  "transactionHash": "0x..."
}
```

The submit endpoint is not called when the confirmation modal opens or when the user clicks **Continue to Wallet**. If the blockchain transaction succeeds but the backend call fails, retry mode resends only the same confirmed hash and never sends a second deployment transaction.

The success page remains blocked until the backend stores and returns the same valid transaction hash.
