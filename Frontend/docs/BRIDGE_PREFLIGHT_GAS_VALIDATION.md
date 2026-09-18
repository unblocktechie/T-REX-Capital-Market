# USDC bridge preflight validation

The bridge uses Circle App Kit's standard CCTP flow. No Circle Forwarder / relayer option is enabled.

Before any bridge transaction is submitted, the frontend performs a fail-closed preflight:

1. Validate the wallet address, route, and requested USDC amount.
2. Request a read-only Circle `estimateBridge()` for the exact route and amount.
3. Read the source USDC balance directly from the source chain.
4. Read the wallet's native gas balance on the source chain.
5. Read the wallet's native gas balance on the destination chain.
6. Parse Circle gas rows using the current Bridge/App Kit shape (`{ name, blockchain, token, fees: { fee } }`) as well as the older flat fee shape.
7. When Circle provides a usable per-chain gas value, use it as the gas estimate.
8. When Circle does not provide a usable gas value for a side, read the current RPC fee market (`estimateFeesPerGas`, falling back to `eth_gasPrice`) and multiply it by a conservative configured gas-unit reserve.
9. Add a 25% safety buffer to the Circle or RPC-derived gas requirement.
10. Block if source USDC is insufficient.
11. Block if source native gas is below the buffered requirement.
12. Block if destination native gas is below the buffered requirement.
13. When Arc USDC is both the bridge asset and native gas asset, require enough Arc USDC for the bridge amount plus buffered source gas.
14. Validate the current CCTP fee/received-amount information returned by Circle.

The complete estimate and balance preflight runs a second time immediately before `kit.bridge()` is called. If the second validation fails, `bridge()` is never called, so Privy does not receive a transaction/signature request.

## Why the RPC fallback exists

Circle's current gas estimate rows can be returned as nested records, for example `fee.fees.fee`, and a route/RPC can occasionally return an error or omit a usable value for one side. Missing a Circle gas amount does **not** mean the wallet has insufficient gas.

The frontend therefore prefers Circle's estimate but does not produce a false failure solely because a Circle gas row is missing. In that case it calculates a conservative reserve from the chain's current RPC gas price.

The fallback reserve is configured with:

- `VITE_BRIDGE_FALLBACK_SOURCE_GAS_UNITS=500000`
- `VITE_BRIDGE_FALLBACK_DESTINATION_GAS_UNITS=500000`

The build-time verifier rejects values below 200,000 gas units. These values are intentionally conservative because the exact source approval/burn or destination mint calldata is not always available before the CCTP burn/attestation lifecycle. Tune these values only from production/testnet measurements with a safety margin.

## Failure behavior

The modal stays before execution and shows a specific message for conditions such as insufficient source USDC, insufficient source gas, insufficient destination gas, unreadable balances, unavailable RPC gas pricing, invalid CCTP maximum fee, or an unsupported route.

If both Circle gas data and the RPC fallback are unavailable for either side, validation still fails closed and no wallet transaction is started.

On the review screen, each gas requirement says whether it came from `Circle gas estimate` or the `RPC safety reserve`.

## Fee configuration

`VITE_BRIDGE_MAX_FEE` remains empty. Circle calculates the current CCTP fee. This avoids a stale fixed `maxFee` causing small transfers to fail with `Max fee must be less than amount`.
