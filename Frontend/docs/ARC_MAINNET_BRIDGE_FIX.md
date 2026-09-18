# Arc Mainnet USDC bridge fix

## Why the Mainnet modal showed `Invalid chain 'Arc'`

The previous frontend pinned `@circle-fin/app-kit` 1.14.0, which resolved `@circle-fin/bridge-kit` 1.14.1. That Bridge Kit release predated Arc Mainnet support in its bridge-chain validation. The Mainnet configuration itself already used the correct Circle identifiers:

- Ethereum Mainnet: `Ethereum`
- Arc Mainnet: `Arc`

The failure happened while `estimateBridge()` validated the route, before any source transaction was submitted.

## Changes in this package

- `@circle-fin/app-kit` is pinned to `1.15.2`.
- `@circle-fin/adapter-viem-v2` is pinned to `1.18.0`.
- Mainnet bridge configuration stays `Ethereum -> Arc`.
- Testnet bridge configuration stays `Ethereum_Sepolia -> Arc_Testnet`.
- `scripts/verify-circle-bridge.mjs` rejects stale Circle packages or mismatched Mainnet/Testnet bridge environment values before `dev:*` or `build:*` starts.
- The wallet page also validates the configured bridge chains before enabling the bridge action.
- If an old deployed bundle still raises Circle's `Invalid chain` error, the modal now shows a deployment-oriented message instead of the raw SDK enum error.

## Install and rebuild

The old lockfile was intentionally removed because it pinned the pre-Arc-Mainnet Circle dependency graph. Regenerate it from the updated `package.json`:

```bash
npm install
npm run verify:bridge -- mainnet
npm run build:mainnet
```

Commit the newly generated `package-lock.json` after `npm install` so CI can return to `npm ci` on subsequent deployments.

## Mainnet bridge values

```env
VITE_BRIDGE_ENVIRONMENT=mainnet
VITE_BRIDGE_SOURCE_APP_KIT_CHAIN=Ethereum
VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN=Arc
VITE_ARC_CHAIN_ID=5042
VITE_WALLET_VIEW_CHAIN_ID=1
```

Do not rename `Arc` to `Arc_Mainnet`; `Arc` is the Mainnet Circle chain identifier.


## Destination-gas safety update

This build uses Circle's standard bridge flow; no forwarding/relayer option is enabled. The same Privy wallet is expected to submit the source-side approval/burn transactions and the destination-side mint transaction.

`VITE_BRIDGE_MAX_FEE` stays empty so Circle computes the current CCTP fee rather than applying a stale hard-coded cap. This avoids the earlier `Max fee must be less than amount` failure for small transfers.

Before `bridge()` can run, the frontend performs a fail-closed preflight:

- validates the wallet address and requested USDC amount;
- reads the source USDC balance directly from the source chain;
- reads native gas balances from both the source and destination chains;
- calls `estimateBridge()` without submitting a transaction;
- requires a usable source and destination gas estimate from Circle;
- applies a 25% gas safety buffer and compares each required gas amount with the current on-chain balance;
- when Arc USDC is both the bridge asset and native gas asset, verifies the wallet can cover the bridge amount plus buffered source gas;
- verifies the current CCTP fee/received amount is valid; and
- repeats the Circle estimate and all fresh balance checks immediately before `bridge()` is called.

If any check fails, no Privy transaction request is started and the modal explains the missing balance or validation condition.
