# Token Issuance Wizard

The Create Token menu now opens a responsive ERC-3643 issuance workflow.

## Routes

- `/app/tokens/new`
- `/app/tokens/new/token-information`
- `/app/tokens/new/supply-pricing`
- `/app/tokens/new/identity-claims`
- `/app/tokens/new/compliance`
- `/app/tokens/new/agents`
- `/app/tokens/new/review`
- `/app/tokens/new/deploying`
- `/app/tokens/:tokenAddress/success`
- `/app/tokens/:tokenAddress`

## State and safety

Wizard values are autosaved through the dedicated Zustand store under the `trex-token-issuance-draft` key. Existing authentication, organization, admin, wallet, layout and navigation stores are not modified.

Deployment calls `POST /tokens/deploy`. The UI requires a confirmed token address and transaction hash before displaying success. Token details can be loaded with `GET /tokens/:tokenAddress`.

The deployment backend should return fields such as:

```json
{
  "tokenAddress": "0x...",
  "tokenName": "Example Token",
  "symbol": "EXT",
  "network": "Sepolia",
  "identityRegistryAddress": "0x...",
  "identityRegistryStorageAddress": "0x...",
  "complianceAddress": "0x...",
  "transactionHash": "0x...",
  "deployedAt": "2026-07-29T00:00:00.000Z",
  "status": "confirmed",
  "explorerUrl": "https://sepolia.etherscan.io"
}
```

No fake blockchain success state is generated when the deployment backend is unavailable or returns incomplete confirmation data.
