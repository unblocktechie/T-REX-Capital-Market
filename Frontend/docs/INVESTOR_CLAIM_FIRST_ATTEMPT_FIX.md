# Investor verification first-attempt wallet fix

## Observed failure

Some investor wallets intermittently failed on the first **Complete Check** attempt with a wallet/RPC error containing:

- `eth_sendRawTransaction`
- `Method not found`
- a long `addClaim` / viem contract error

A second attempt could then succeed.

## Root cause in the frontend path

The claim page created a separate viem wallet client around the connector provider and called `walletClient.writeContract()` for the ONCHAINID `addClaim` transaction. For the affected wallet/provider combinations, that path could surface an unsupported custom `eth_sendRawTransaction` route before the transaction was successfully submitted.

The error was then passed through the generic API error formatter, so the complete low-level contract/RPC diagnostic was displayed to the investor.

## Fix

The claim submission service now:

1. Keeps all existing wallet, registered-address, network, prepared-claim, signature, and transaction-data validations.
2. Encodes the existing `addClaim` call locally with viem.
3. Sends the transaction through the connected EIP-1193 wallet provider using `eth_sendTransaction`.
4. Lets MetaMask remain responsible for signing/broadcasting.
5. Validates that the wallet returns a real transaction hash before the existing recovery/confirmation flow continues.
6. Keeps the existing per-claim submission lock, so repeated clicks cannot create simultaneous requests.

No claim payload, backend endpoint, contract address, claim topic, signature, or verification workflow was changed.

## User-facing error handling

Raw RPC/contract stacks are no longer shown in the verification card or toast. Known wallet/network failures are converted to short messages, for example:

> Your wallet network connection could not send the approval. No changes were made. Please try again.

Persisted backend failure strings are also screened so technical contract/RPC dumps are not rendered to the investor. Internal error codes remain available in application state, while the UI only shows a support reference when one is returned.

## Regression checks

The existing flow is preserved:

`prepare claim -> wallet transaction -> store tx hash -> backend confirmation/recovery -> confirmed check`

The wallet transaction is still submitted only by the registered investor wallet on the required chain. The existing retry, refresh recovery, status polling, and duplicate-submission locks remain in place.
