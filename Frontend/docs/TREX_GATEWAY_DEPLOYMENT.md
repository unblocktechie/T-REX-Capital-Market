# T-REX Gateway Live Deployment

## Active deployment flow

1. The token proposal is submitted to the backend when it is not already `readyToDeploy`.
2. The frontend loads the token's selected network from `GET /api/v1/chains/{chainUid}/config`.
3. The connected account must match the approved organization/treasury wallet.
4. The wallet must be connected to the `chainId` returned for the selected network before any write is enabled.
5. The frontend uses the backend-provided issuer ONCHAINID and verifies that contract code exists. ONCHAINID creation/unlock remains a backend operation; the browser does not call the Identity Factory directly.
6. Claim topics and modular-compliance initialization calls are prepared with the selected chain's compliance-module addresses.
7. The issuer-selected agent, issuer wallet, and selected chain's Platform Controller are included in `tokenDetails.tokenAgents`, with duplicate addresses removed.
8. The issuer wallet signs `deployTREXSuite(tokenDetails, claimDetails)` and pays gas on the selected network.
9. The confirmed receipt is searched for the Factory `TREXSuiteDeployed` event.
10. The frontend verifies Token/Identity Registry ownership and agent roles, including the Platform Controller's Token Agent role.
11. When the new token is paused, the issuer wallet signs `unpause()` to prove that the issuer has Token Agent rights.
12. The complete confirmed deployment response is logged to the browser console.
13. The deployment record is sent to `POST /tokens/deploy` for persistence in the Token table.

## Console output

Open the browser developer tools and inspect these groups:

```text
[T-REX deployment request]
[T-REX deployment response]
[Token deployment persistence]
```

They include the Gateway payload, confirmed transaction receipt, parsed suite addresses, owner/agent verification, issuer unpause result, Token-table persistence payload, and backend API response.

## Platform Token Agent

For newly created tokens, the Platform Controller returned by the selected-chain configuration is the platform-level Token Agent. Do not add a separate deployer/platform wallet as a Token Agent.

The active Token Agent list can also contain the configured issuer agent and issuer wallet. Duplicate addresses are removed.

## Token-table deployment payload

`POST /tokens/deploy` receives both the new nested structure and existing flat aliases:

```json
{
  "deployedAt": "2026-09-13T00:00:00.000Z",
  "deployTx": "0x...",
  "transactionHash": "0x...",
  "contracts": {
    "token": "0x...",
    "ir": "0x...",
    "irs": "0x...",
    "tir": "0x...",
    "ctr": "0x...",
    "mc": "0x..."
  },
  "claimIssuer": {
    "wallet": "0x...",
    "contract": "0x...",
    "claimTopic": "1,2",
    "claimTopics": ["1", "2"]
  },
  "tokenAgents": ["0x..."],
  "identityRegistryAgents": ["0x..."],
  "verification": {},
  "unpause": {},
  "receipt": {}
}
```

The backend implementation of `POST /tokens/deploy` must map these fields to the Token table columns/JSON fields and commit them atomically. The frontend cannot directly write a database table.

## Decimal handling

The maximum holder/investment balance is encoded with:

```js
parseUnits(String(compliance.maximumBalance), tokenDecimals)
```

This uses the exact decimals selected for the token. Maximum investors remains an integer because it is a holder count rather than a token amount.

## Public frontend configuration

Chain-specific gateway, controller, compliance-module, implementation-contract, confirmation, RPC/explorer, and payment-token data are loaded from `GET /api/v1/chains/{chainUid}/config`.

Keep only generic browser settings in `VITE_*` configuration. Never place a deployer or issuer private key, internal RPC, or backend fallback RPC in frontend source, browser storage, or a client-side build. Issuers sign through their connected wallet.
