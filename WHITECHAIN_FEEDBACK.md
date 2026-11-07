# Whitechain Feedback

## What Worked Well

- Whitechain's EVM compatibility made it straightforward to reuse our existing Solidity tooling and
  ERC-3643-based T-REX Capital Market architecture.
- The network provided a practical environment to develop our hackathon addition: automated
  onchain token price updates using an authorized service wallet.

## Where We Needed More Clarity

- We had to spend extra time identifying the appropriate testnet stablecoins, understanding the
  difference between native and bridged tokens such as USDT.e/USDC.e, and confirming which
  token addresses were relevant to our setup.
- While planning our automated pricing integration, we needed to work through network
  configuration, service-wallet permissions, and how to verify transaction confirmations reliably.

## Documentation We'd Like to See

- One up-to-date testnet reference page with chain ID, RPC URL, block explorer, gas token, faucet,
  and verified token contract addresses.
- Clear examples of testnet stablecoin bridging and an explanation of native vs. bridged stablecoin
  availability.
- An end-to-end Solidity example covering contract deployment, authorized service-wallet
  transactions, and confirmation/error handling.

## Overall

Whitechain's EVM compatibility was helpful for extending an existing project rather than starting from
scratch. More consolidated, testnet-specific documentation would make the integration process faster
for developers.
