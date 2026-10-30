# Platform Controller as the default Token Agent

Every token created through the issuer token-creation flow includes the selected chain's Platform Controller as a Token Agent in the `deployTREXSuite` payload.

The controller address is loaded from `GET /api/v1/chains/{chainUid}/config` at `contracts.platform.platformController`. There is no frontend default controller address and no environment override.

The deployment service adds the Platform Controller to `tokenDetails.tokenAgents` together with the issuer/user-selected token agent and issuer wallet. Addresses are de-duplicated before the gateway transaction is prepared. A separate deployer/platform wallet is not added as a Token Agent.

This is required so controller-based purchase/mint and redemption/burn flows can operate without a separate post-creation `addAgent` transaction. Deployment verification also checks `token.isAgent(platformController)` after the token suite is created.
