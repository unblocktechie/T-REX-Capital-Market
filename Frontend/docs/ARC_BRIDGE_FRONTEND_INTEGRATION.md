# Bidirectional Arc / Sepolia USDC bridge frontend integration

## Scope

Wallet Management supports USDC bridging in both testnet directions for the same Privy embedded wallet:

- **Bridge to Arc:** configured wallet-view network USDC → Arc USDC
- **Bridge to Sepolia:** Arc USDC → configured wallet-view network USDC

The implementation uses Circle App Kit's Bridge capability instead of manually orchestrating CCTP burn, attestation, and mint operations.

## Configuration

The active bridge configuration lives in `src/config/web3.js` under `usdcBridge`. It contains two explicit route definitions (`toArc` and `toSepolia`), plus the shared token, transfer-speed, and fee policy.

Keeping the route definitions separate from the bridge UI/service makes the later mainnet migration a configuration change: replace the testnet source/destination chain metadata with the corresponding mainnet definitions while retaining the same direction selector and execution flow.

## Wallet Management UX

The USDC balance row exposes the contextually correct action for the network currently being viewed:

- Ethereum Sepolia → **Bridge to Arc**
- Arc → **configured reverse bridge destination**

The bridge modal also contains a clear two-option direction selector so the user can switch routes before confirming. Changing direction resets the amount and estimate to prevent a quote from one route being reused on the opposite route.

## Balance and gas handling

The modal always uses live source-chain balances:

- Sepolia → Arc: source USDC is Circle's official Sepolia USDC contract and source gas is Sepolia ETH.
- Arc → Sepolia: Arc's native USDC balance is both the source asset and the source-chain gas asset. The UI prevents bridging the exact full balance and reminds the user to leave USDC available for Arc gas.

After a successful bridge, both Arc and Sepolia balances are refreshed and the user can jump directly to the destination network's balance view.

## App Kit flow

Before execution, `estimateBridge` is called for the selected direction and the returned provider/gas fee information is shown in the review step. The execution UI follows the App Kit lifecycle and surfaces explorer links when available.

If App Kit returns an error state and explicitly marks it retryable, the service uses `retryBridge` with that existing bridge result. It never creates an unrelated second transfer as an automatic retry.

## Dependencies

- `@circle-fin/app-kit`
- `@circle-fin/adapter-viem-v2`
- `viem`


## Network profiles

Bridge source/destination chain IDs, network names, USDC addresses, Circle App Kit chain identifiers, and the App Kit environment are selected with `VITE_WALLET_VIEW_*` and `VITE_BRIDGE_*` values. See `docs/ARC_NETWORK_CONFIGURATION.md`. The bridge code path is shared by Testnet and Mainnet.
