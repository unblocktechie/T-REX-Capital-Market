# T-REX Gateway Live Deployment

## Active deployment flow

1. The token proposal is submitted to the backend when it is not already `readyToDeploy`.
2. The active Wagmi connector requests the current MetaMask or WalletConnect account.
3. The connected account must match the approved organization/treasury wallet.
4. The wallet must be connected to Ethereum Sepolia (`11155111`).
5. The frontend reads the issuer ONCHAINID from the configured Identity Factory and verifies that contract code exists.
6. Claim topics and modular-compliance initialization calls are prepared.
7. The issuer-selected agent, issuer wallet, and platform wallet are included in `tokenDetails.tokenAgents`, with duplicate addresses removed.
8. The issuer wallet signs `deployTREXSuite(tokenDetails, claimDetails)` and pays Sepolia gas.
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
0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859
```

The active Token Agent list contains the configured issuer agent, issuer wallet, and platform wallet. Duplicate addresses are removed.

## Token-table deployment payload

`POST /tokens/deploy` receives both the new nested structure and existing flat aliases:

```json
{
  "deployedAt": "2026-07-31T00:00:00.000Z",
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
VITE_TREX_GATEWAY_ADDRESS=0x32c06Dcd426ee86c4FDD2514c58785ff7A5DDAc0
VITE_TREX_PLATFORM_WALLET_ADDRESS=0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859
VITE_ONCHAIN_ID_FACTORY_ADDRESS=0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15
VITE_COUNTRY_RESTRICT_MODULE_ADDRESS=0xF5D3F29B57f2fd33aDbF5d6A5F5C774C07D18fDf
VITE_MAX_BALANCE_MODULE_ADDRESS=0x45747f7068CE9C743b82ec3E8E92627b495860A6
VITE_MAX_INVESTORS_MODULE_ADDRESS=0xa729d37329Bc0F513d5E50d200ec9cf06a80064F
```

Never place a deployer or issuer private key in frontend source, a `VITE_*` variable, browser storage, or a client-side build. Issuers sign through their connected wallet.
