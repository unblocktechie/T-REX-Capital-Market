# Registry organization wallet guard

The issuer Add to Registry action now requires the connected wallet to match the organization wallet saved during organization onboarding.

- The organization wallet is loaded from the existing organization API state.
- If no wallet is connected, Add to Registry is replaced by a Connect Organization Wallet action and guidance.
- If a different wallet is connected, Add to Registry is replaced by Change Wallet and guidance.
- A new registry operation is not prepared until the wallet address matches the approved organization wallet.
- The wallet account is validated again immediately before the `registerIdentity` transaction is submitted.
- Existing registry operations that already have a transaction hash remain recoverable through Check Status without requiring the issuer to reconnect or send another transaction.
- Network switching, delegated MetaMask execution, hash-only confirmation, recovery, and confirmation polling are unchanged.
