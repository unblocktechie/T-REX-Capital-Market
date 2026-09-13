# Organization Wallet Integration

The organization and investor flows use Privy embedded wallets and are restricted to Arc Testnet. The authenticated Privy wallet is the secure account used for on-chain actions.

## Frontend flow

1. Privy email authentication creates or restores the user's embedded EVM wallet.
2. The application configures Privy with Arc Testnet as both the default and supported chain.
3. If an embedded wallet reports another chain, the UI requests a switch to Arc Testnet before any on-chain write.
4. The navbar shows the shortened Privy wallet address and the Arc native USDC balance.
5. Issuer and investor actions continue to validate the expected registered wallet before signing.
6. Public reads, simulations, and receipt polling use the configured Arc Testnet RPC; signed writes use the Privy wallet provider.
7. Explorer links use ArcScan and are generated only for the configured chain.

## Arc Testnet configuration

```env
VITE_WEB3_DEFAULT_CHAIN=arc-testnet
VITE_WEB3_ENABLED_CHAINS=arc-testnet
VITE_ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
```

The frontend chain definition uses:

- Chain ID: `5042002`
- Explorer: `https://testnet.arcscan.app`
- Native gas asset: USDC
- Required receipt confirmations: `1`

The configured payment-token address is Arc's USDC ERC-20 interface (`0x3600000000000000000000000000000000000000`). Payment-token decimals are still read from the contract at runtime instead of being hardcoded.

## Backend submit contract

The existing organization submission API contract is unchanged. Where the backend persists wallet/network metadata or verifies transaction receipts, its supported chain and RPC configuration must also be migrated to Arc Testnet.

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

The backend should continue to validate and persist the approved EVM wallet and reject malformed or conflicting addresses according to product rules.

## Security note

Never request or store a seed phrase or private key. The browser receives signing capability through the authenticated Privy embedded wallet, while public RPC access is used only for non-secret reads, simulation, and confirmation.

## Styling scope

The Arc migration changes network configuration, chain-aware links, payment labels, and transaction-confirmation behavior only. Existing responsive layouts and interaction patterns are preserved.
