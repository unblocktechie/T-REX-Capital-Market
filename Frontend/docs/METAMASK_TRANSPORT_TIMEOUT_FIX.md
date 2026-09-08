# MetaMask transport timeout fix

## Issue

The deployment page could remain in the processing state while the console reported:

- `TransportTimeoutError: Transport request timed out`
- `Failed to launch metamask://connect/... because the scheme does not have a registered handler`

The application used Wagmi's MetaMask Connect connector. On desktop it could attempt a mobile deep-link transport even when the MetaMask browser extension was already connected.

## Updated connection strategy

- Desktop MetaMask uses Wagmi's injected EIP-1193 connector targeted to MetaMask.
- Mobile wallets continue to use WalletConnect.
- Public reads, simulations, and receipt polling use the configured Sepolia HTTP RPC.
- Only signed writes use the injected wallet transport.
- Deployment reads `eth_accounts` instead of requesting account authorization a second time.
- Wallet transport failures move the deployment page into a terminal error state and show a retryable toast.
- An in-flight guard prevents duplicate deployment attempts from React effect rerenders.

## Safe deployment ordering

1. Validate the connected account and Sepolia chain locally.
2. Read and simulate through the configured public RPC.
3. Request the issuer's wallet signature.
4. Wait for the confirmed transaction receipt.
5. Validate the transaction hash.
6. Call the backend submit API with the confirmed hash.

No backend submit request is sent before a valid confirmed transaction hash exists.
