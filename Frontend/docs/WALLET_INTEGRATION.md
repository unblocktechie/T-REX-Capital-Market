# Organization Wallet Integration

The organization review step now requires a connected issuer wallet before the final application can be submitted.

## Frontend flow

1. The final review page shows **Connect Wallet** instead of **Submit Application**.
2. The wallet modal supports MetaMask and WalletConnect.
3. The configured organization network is selected during connection. If the wallet is on another network, the UI requires a switch to Sepolia before submission.
4. After connection, the navbar shows the shortened address (`0x123...abcde`) and native-token balance.
5. The final submit modal explains that this address becomes the primary organization wallet for token creation, smart-contract deployment, and issuer operations.
6. The user must explicitly acknowledge that message before submission.
7. The approved organization overview displays the persisted wallet address and network with a block-explorer link.

## Environment configuration

```env
# Required for WalletConnect QR/mobile support.
VITE_WALLETCONNECT_PROJECT_ID=

# Network required at organization submission time.
VITE_WEB3_DEFAULT_CHAIN=sepolia

# Sepolia is the only network available in the organization wallet flow.
VITE_WEB3_ENABLED_CHAINS=sepolia

VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Create a WalletConnect/Reown project ID and allowlist every frontend domain used by the application. This organization flow is intentionally restricted to Sepolia; Ethereum mainnet is not exposed in the connector or network selector.

## Backend submit contract

The frontend sends the wallet in the existing final submission request:

```http
POST /api/v1/organizations/me/submit
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "walletAddress": "0x..."
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
