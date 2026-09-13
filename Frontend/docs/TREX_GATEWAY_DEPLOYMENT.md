# T-REX Gateway Live Deployment

## Active deployment flow

1. The token proposal is submitted to the backend when it is not already `readyToDeploy`.
2. The authenticated Privy connector requests the current embedded wallet account.
3. The connected account must match the approved organization/treasury wallet.
4. The wallet must be connected to Arc Testnet (`5042002`).
5. The frontend reads the issuer ONCHAINID from the configured Identity Factory and verifies that contract code exists.
6. Claim topics and modular-compliance initialization calls are prepared.
7. The issuer-selected agent, issuer wallet, and platform wallet are included in `tokenDetails.tokenAgents`, with duplicate addresses removed.
8. The issuer Privy wallet signs `deployTREXSuite(tokenDetails, claimDetails)` and pays the Arc Testnet network fee in USDC.
9. The confirmed receipt is searched for the Factory `TREXSuiteDeployed` event.
10. The frontend verifies Token/Identity Registry ownership and agent roles.
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

They include the complete Gateway payload, confirmed transaction receipt, parsed suite addresses, owner/agent verification, issuer unpause result, Token-table persistence payload, and backend API response.

## Platform Token Agent

The following wallet is always included as a Token Agent:

```text
0x849F887daec1B14c161ec377C95549ef83dDf3ff
```

The active Token Agent list contains the configured issuer agent, issuer wallet, and platform wallet. Duplicate addresses are removed.

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

```env
VITE_TREX_GATEWAY_ADDRESS=0x9b0077e6000C9937eE769A61519F9CdFc3f30331
VITE_TREX_PLATFORM_WALLET_ADDRESS=0x849F887daec1B14c161ec377C95549ef83dDf3ff
VITE_TREX_PLATFORM_CONTROLLER_ADDRESS=0x972E9CEf9eA9d3A9d7f3261bb8e16bA59E76a0FB
VITE_TREX_PAYMENT_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
VITE_ONCHAIN_ID_FACTORY_ADDRESS=0xA30A9FC6d6ea2Fa3fa3F01265a3C1253125481D8
VITE_COUNTRY_RESTRICT_MODULE_ADDRESS=0x7f3a67C7b520a0F01d7A3d98A5B7F2a3bfc7A54D
VITE_MAX_BALANCE_MODULE_ADDRESS=0x08B942c8aCFdB143F0096Cc4D80160221B589804
VITE_MAX_INVESTORS_MODULE_ADDRESS=0xa893BFEE2eCd38A61De91D74Ec15427dA6f7890f
```

Never place a deployer or issuer private key in frontend source, a `VITE_*` variable, browser storage, or a client-side build. Issuers sign through their connected wallet.
