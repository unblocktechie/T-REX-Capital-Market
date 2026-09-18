# Arc network configuration

The frontend uses one generic **Arc** implementation. There is no separate Testnet or Mainnet application branch. The active network is selected entirely through browser-safe `VITE_*` configuration values before the build is generated.

The checked-in/default configuration preserves the existing Testnet behavior. For a configuration-only switch, copy either `.env.testnet.example` or `.env.mainnet.example` to `.env`, provide the deployment-specific contract addresses, and run the normal build command.

## Network profiles

| Setting | Testnet | Mainnet |
| --- | --- | --- |
| UI chain name | `Arc` | `Arc` |
| Chain ID | `5042002` | `5042` |
| HTTP RPC | `https://rpc.testnet.arc.network` | `https://rpc.mainnet.arc.io` |
| WebSocket RPC | `wss://rpc.testnet.arc.network` | `wss://rpc.mainnet.arc.io` |
| Explorer | `https://testnet.arcscan.app` | `https://explorer.arc.io` |
| Native gas currency | `USDC` | `USDC` |
| Native decimals | `18` | `18` |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` |
| Environment flag | `VITE_ARC_IS_TESTNET=true` | `VITE_ARC_IS_TESTNET=false` |
| UI environment badge | `Testnet` | `Mainnet` |

The UI intentionally uses **Arc** as the network name. A separate environment badge can display `Testnet` or `Mainnet` without embedding a Testnet-specific product/network name into components.

## Required variables

The `VITE_ARC_*` variables control the transaction-critical Arc chain: network key, chain ID, RPC URLs, explorer, environment classification, native currency metadata, icon, and confirmation count.

The Mainnet profile now points `VITE_ARC_NETWORK_ICON_URL` at the Arc brand icon published by `arc.io`, so the same Arc mark appears consistently across wallet controls, marketplace cards, portfolio views, and investment screens. `src/config/web3.js` also uses that official icon as a safe UI fallback when an environment leaves the optional icon override empty; the existing generic network glyph remains the final runtime fallback if the image itself cannot be loaded.

The `VITE_WALLET_VIEW_*` variables control the existing secondary wallet-balance/bridge chain. The Testnet profile keeps Ethereum Sepolia exactly as before. The Mainnet example uses Ethereum Mainnet, including its USDC address and explorer/RPC values.

The `VITE_BRIDGE_*` variables control the existing Circle App Kit bridge route. The bridge implementation is shared; source/destination SDK identifiers and App Kit environment are supplied by configuration. Because Circle SDK support can change independently of this application, verify the exact Mainnet chain identifier against the installed `@circle-fin/app-kit` / `@circle-fin/bridge-kit` version before production deployment.

The `VITE_TREX_*`, `VITE_ONCHAIN_ID_FACTORY_ADDRESS`, and compliance-module variables are application deployment addresses. They are **not portable between networks**. Mainnet builds must use contracts actually deployed and verified on Arc Mainnet. The frontend does not invent or silently reuse Testnet application contracts.

## Testnet build

```bash
cp .env.testnet.example .env
npm run build
```

No source-code edits are required. This profile keeps the existing Testnet chain ID, wallet-view network, bridge configuration, and T-REX deployment addresses.

## Mainnet build

```bash
cp .env.mainnet.example .env
# Replace all REQUIRED_MAINNET_* placeholders with the real production deployments.
npm run build
```

Before deploying the resulting build, verify at minimum:

1. `VITE_ARC_CHAIN_ID=5042`.
2. The configured Arc RPC returns chain ID `5042`.
3. Every T-REX / ONCHAINID / compliance-module address is a Mainnet deployment.
4. `VITE_TREX_PAYMENT_TOKEN_ADDRESS` points at the intended Mainnet payment token.
5. Privy allows the configured Arc Mainnet chain.
6. The Circle App Kit identifiers in the production profile are supported by the installed SDK release if the bridge UI is enabled/used.
7. Backend services that validate chain IDs, poll receipts, or store network metadata use the same Mainnet configuration.

## Adding another Arc-compatible environment

Do not add another chain implementation. Create a new `.env` profile and set the generic variables. `src/config/web3.js` always constructs the same `arcChain` object from the selected values.

## Secrets

All `VITE_*` values are public after bundling. Never put private keys, signing keys, passwords, server API secrets, or other confidential credentials in these files. Continue using the existing backend/secret-management mechanism for sensitive values.

## Environment-only configuration and build commands

`src/config/app.config.js` preserves the existing `centralizedConfig` and `appConfig`
exports. Values are built by `src/config/config.factory.js`: supplied `VITE_*` values
override configuration, while omitted values use the legacy/default Testnet-compatible
fallbacks. Invalid supplied values still fail validation.

For `mainnet` mode, network-critical values must be present directly in `.env.mainnet`.
This prevents the fallback mechanism from silently inheriting Testnet chain or contract
configuration for a production build.

Use these commands:

```bash
# Common/default build: loads .env (currently the existing Testnet-compatible profile)
npm run build

# Explicit Arc Testnet build: loads .env + .env.testnet
npm run build:testnet

# Explicit Arc Mainnet build: loads .env + .env.mainnet
npm run build:mainnet
```

For Mainnet, first create the real profile:

```bash
cp .env.mainnet.example .env.mainnet
# Replace every REQUIRED_MAINNET_* deployment address, then:
npm run build:mainnet
```

The Vite configuration validates the full public environment before starting and
also checks that `build:testnet` resolves to a Testnet profile and
`build:mainnet` resolves to a Mainnet profile. This prevents an explicit Mainnet
build from silently falling back to Testnet values.

## Circle bridge SDK compatibility

Arc Mainnet bridging requires a Circle SDK release that includes the `Arc` Mainnet bridge-chain definition. This frontend pins `@circle-fin/app-kit` 1.15.2 and `@circle-fin/adapter-viem-v2` 1.18.0. The `predev:*` and `prebuild:*` scripts run `scripts/verify-circle-bridge.mjs` so an older dependency set or a Mainnet/Testnet chain-name mismatch fails before Vite starts.

For Mainnet, keep `VITE_BRIDGE_SOURCE_APP_KIT_CHAIN=Ethereum` and `VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN=Arc`. For Testnet, use `Ethereum_Sepolia` and `Arc_Testnet`.
