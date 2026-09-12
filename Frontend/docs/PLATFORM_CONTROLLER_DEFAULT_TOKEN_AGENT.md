# Platform Controller as a default Token Agent

Every token created through the issuer token-creation flow includes the configured Platform Controller as a Token Agent in the `deployTREXSuite` payload.

Current default controller:

```text
0x9BEFDF75Dc94bbB36532c5d7A74daab28714f579
```

The deployment service adds this address to `tokenDetails.tokenAgents` together with the issuer/user-selected token agent and existing platform wallet. Addresses are de-duplicated before the gateway transaction is prepared.

This is required so controller-based purchase/mint and redemption/burn flows can operate without a separate post-creation `addAgent` transaction. The deployment verification also checks `token.isAgent(platformController)` after the token suite is created.

The address remains configurable through `VITE_TREX_PLATFORM_CONTROLLER_ADDRESS` for controlled future migrations; if that setting is absent, the current controller above is used automatically.
