# Organization Wallet Integration

The organization review step now requires a connected issuer wallet before the final application can be submitted.

## Frontend flow

1. The final review page shows **Connect Wallet** instead of **Submit Application**.
2. The wallet modal supports MetaMask and WalletConnect.
3. The user selects an active backend-provided network. The frontend loads its runtime configuration and requires the wallet to match the returned `chainId` before submission.
4. After connection, the navbar shows the shortened address (`0x123...abcde`) and native-token balance.
5. The final submit modal explains that this address becomes the primary organization wallet for token creation, smart-contract deployment, and issuer operations.
6. The user must explicitly acknowledge that message before submission.
7. The approved organization overview displays the persisted wallet address and network with a block-explorer link.

## Environment configuration

Only generic wallet configuration remains in the frontend environment:

```env
# Required for WalletConnect QR/mobile support.
VITE_WALLETCONNECT_PROJECT_ID=
```

Supported networks are loaded from `GET /api/v1/chains`. The selected network's RPC, explorer, native currency, confirmations, contract suite, and payment-token catalogue are loaded from `GET /api/v1/chains/{chainUid}/config`. Do not add chain-specific RPC or contract-address `VITE_*` variables.

## Backend submit contract

The frontend sends the wallet in the existing final submission request:

```http
POST /api/v1/organizations/me/submit
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "walletAddress": "0x...",
  "chainUid": "60000000-0000-4000-8000-000000000001"
}
```

The backend submit DTO and organization entity must:

- accept a valid EVM `walletAddress`;
- normalize and persist it as the organization wallet;
- reject an empty, malformed, or already-conflicting address according to product rules;
- return it from `POST /organizations/me/submit` and `GET /organizations/me`;
- prevent changing it after submission unless an explicit administrative wallet-rotation workflow is implemented.

The frontend accepts these response aliases while the backend contract is finalized: `walletAddress`, `organizationWalletAddress`, `organizationWallet.address`, or `wallet.address`.

## Security note

A connected address proves that the browser wallet exposed the account, but a backend that needs stronger proof of control should add a nonce-based signed-message challenge before accepting the organization wallet. Never request or store a seed phrase or private key.

## Styling scope

The wallet modal, organization submission panel, confirmation modal, action bar, and organization wallet overview card use Tailwind utilities directly. Existing shared organization styles remain for unchanged forms and common components so the current layout and behavior are not destabilized during this wallet-focused update.
