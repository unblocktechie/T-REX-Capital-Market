# Frontend: backend-driven chain and contract configuration

## Outcome

The backend is now the single source of truth for network metadata, platform contracts,
implementation contracts, compliance modules, confirmation counts, and supported payment
tokens. The frontend must not keep a chain-address map in source code or in `VITE_*`
environment variables.

## API sequence

1. On application startup, call `GET /api/v1/chains` and show the active networks.
2. Store the selected `chainUid` (not only `chainId`).
3. On initial selection and every network switch, call:

   `GET /api/v1/chains/{chainUid}/config`

4. Build the wallet/viem/wagmi network from that response.
5. Ask the wallet to switch to `data.chainId` before any write.
6. Use only the returned contract and payment-token data for the selected chain.
7. Clear chain-scoped query caches whenever `chainUid` changes.

The endpoint is public. It returns only browser-safe values. A representative response is:

```json
{
  "success": true,
  "data": {
    "chainUid": "60000000-0000-4000-8000-000000000001",
    "chainCode": "SEPOLIA",
    "chainName": "Ethereum Sepolia",
    "chainId": 11155111,
    "networkName": "sepolia",
    "nativeCurrency": { "name": "Sepolia Ether", "symbol": "ETH", "decimals": 18 },
    "rpcUrls": { "public": "https://ethereum-sepolia-rpc.publicnode.com" },
    "explorerUrl": "https://sepolia.etherscan.io",
    "confirmations": { "transactions": 2, "registry": 2 },
    "contracts": {
      "platform": {
        "trexImplementationAuthority": "0x...",
        "trexFactory": "0x...",
        "trexGateway": "0x...",
        "identityImplementationAuthority": "0x...",
        "identityFactory": "0x...",
        "complianceModules": {
          "countryRestrict": "0x...",
          "maxBalance": "0x...",
          "maxInvestors": "0x..."
        },
        "platformController": "0x...",
        "platformControllerOwner": "0x...",
        "idFactoryAccessManager": "0x... or null",
        "idFactoryAccessManagerAdmin": "0x... or null"
      },
      "implementations": {
        "token": "0x...",
        "claimTopicsRegistry": "0x...",
        "identityRegistry": "0x...",
        "identityRegistryStorage": "0x...",
        "trustedIssuersRegistry": "0x...",
        "modularCompliance": "0x...",
        "identity": "0x..."
      }
    },
    "paymentTokens": []
  }
}
```

`paymentTokens` contains only active database rows that also exist in the selected
controller's on-chain `paymentTokens()` result. Do not merge a local token list into it.

## Frontend configuration store

Keep a query/cache keyed by `chainUid`, for example:

```ts
type SelectedChainConfig = Awaited<ReturnType<typeof getChainConfig>>;

const getChainConfig = async (chainUid: string) =>
  api.get(`/api/v1/chains/${chainUid}/config`).then((response) => response.data.data);
```

Derive the dynamic wallet chain from:

- `chainId`
- `chainName`
- `nativeCurrency`
- `rpcUrls.public`
- `explorerUrl`

Contract consumers must receive the selected configuration as an argument or from the
selected-chain store. They must not import an address from an environment module.

## Address selection rules

- New token deployment: use `contracts.platform.trexGateway`, the three compliance-module
  addresses, `contracts.platform.platformController`, and the selected payment token.
- ONCHAINID creation/status: the backend owns this operation; use `/chains/me` and
  `/chains/{chainUid}/unlock`. Do not invoke the Identity Factory directly from the browser.
- Invest/redeem: use the token detail's `tokenAgentWalletAddress`/controller when supplied.
  This preserves compatibility for already-deployed tokens. For a newly created token it
  will equal the selected chain's current `platformController`.
- Do not add the deployer/platform wallet as a Token Agent. The Platform Controller is the
  platform-level Token Agent for newly created tokens.
- Payment-token dropdowns use `data.paymentTokens`. Persist the selected token address with
  token creation and use that token for purchase/redemption.

## Environment cleanup

Remove these frontend variables after the API integration is deployed and tested:

```text
VITE_TREX_CHAIN_CONFIG_JSON
VITE_TREX_GATEWAY_ADDRESS
VITE_TREX_PLATFORM_WALLET_ADDRESS
VITE_COUNTRY_RESTRICT_MODULE_ADDRESS
VITE_MAX_BALANCE_MODULE_ADDRESS
VITE_MAX_INVESTORS_MODULE_ADDRESS
```

Keep only generic frontend configuration such as:

```text
VITE_API_BASE_URL
VITE_API_VERSION
VITE_WALLETCONNECT_PROJECT_ID
VITE_REQUEST_TIMEOUT
```

Never add a deployer private key, internal RPC, or backend fallback RPC to any `VITE_*`
variable. `VITE_*` values are public browser data.

## Chain switch behavior

When the user chooses another network:

1. Set the requested `chainUid` to a loading state.
2. Fetch `/chains/{chainUid}/config`.
3. Validate that the wallet is on the returned `chainId`; request a switch/add-network when needed.
4. Replace the active contract clients and payment-token list atomically.
5. Invalidate token, allowance, balance, registry, identity, and transaction queries from the old chain.
6. Carry `chainUid` in onboarding/token APIs that accept it.
7. Do not permit a write while configuration is loading or the wallet chain does not match.

If the endpoint returns `503 PAYMENT_TOKEN_REGISTRY_UNAVAILABLE`, show the network as
temporarily unavailable for payment operations; do not fall back to a local address list.

## Admin create-network changes

The create form still sends network/runtime fields, and must now send the complete immutable
deployment contract suite using these camelCase fields:

```text
contractSuiteDeployedAt
trexImplementationAuthorityAddress
trexFactoryAddress
trexGatewayAddress
identityImplementationAuthorityAddress
identityFactoryAddress
platformControllerAddress
countryRestrictModuleAddress
maxBalanceModuleAddress
maxInvestorsModuleAddress
platformControllerOwnerAddress
idFactoryAccessManagerAddress (required for every new chain)
idFactoryAccessManagerAdminAddress (nullable only when the deployment does not have it)
tokenImplementationAddress
claimTopicsRegistryImplementationAddress
identityRegistryImplementationAddress
identityRegistryStorageImplementationAddress
trustedIssuersRegistryImplementationAddress
modularComplianceImplementationAddress
identityImplementationAddress
paymentTokenAddresses
```

`paymentTokenAddresses` must contain every address returned by the new Platform Controller.
The backend verifies the exact list and creates the linked payment-token master rows from
on-chain ERC-20 metadata. Contract fields remain immutable after creation. The existing
admin edit screen continues to edit only public RPC URL, explorer URL, fallback internal RPC
URLs, active/inactive state, and image.

## Acceptance checklist

- No chain address remains hardcoded or in frontend environment configuration.
- Sepolia and ARC Testnet both load from the selected-chain endpoint.
- Switching chains replaces wallet network, contracts, payment tokens, and cached data.
- New token deployment uses the selected chain's current Platform Controller only.
- Existing deployed tokens continue using the controller stored with the token.
- A controller-registry outage never causes the frontend to trust a stale local payment-token list.
- No private key or internal/fallback RPC appears in browser network responses.
