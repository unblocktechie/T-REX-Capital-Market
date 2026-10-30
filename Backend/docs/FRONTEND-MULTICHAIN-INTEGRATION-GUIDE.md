# Frontend Multichain Integration Guide

## Purpose

The backend now treats the database as the source of truth for supported networks, network contracts, payment tokens, confirmations, indexer start blocks, and per-user ONCHAINID records.

The frontend must never hardcode a chain ID, RPC URL, Identity Factory, Platform Controller, TREX Factory, or payment-token address. Read the selected network and token from the APIs below.

## Important identifiers

- `chainUid` is the backend identifier used in forms and admin APIs.
- `chainId` is the EVM network identifier used by the wallet and transaction-confirm API.
- Every token has one `chainUid`. It may be changed while the token status is `draft` and becomes immutable after the token leaves `draft`.
- Every payment token belongs to exactly one `chainUid`.
- An Issuer or Investor has a separate ONCHAINID for each unlocked chain.

## 1. Load supported chains

Public network selector:

```http
GET /api/v1/chains
```

The response includes wallet-safe data such as:

```json
{
  "chainUid": "60000000-0000-4000-8000-000000000001",
  "chainCode": "SEPOLIA",
  "chainName": "Ethereum Sepolia",
  "chainId": 11155111,
  "networkName": "sepolia",
  "nativeCurrencyName": "Sepolia Ether",
  "nativeCurrencySymbol": "ETH",
  "nativeCurrencyDecimals": 18,
  "publicRpcUrl": "https://ethereum-sepolia-rpc.publicnode.com",
  "explorerUrl": "https://sepolia.etherscan.io",
  "identityFactoryAddress": "0x...",
  "platformControllerAddress": "0x...",
  "trexFactoryAddress": "0x...",
  "isTestnet": true,
  "isDefault": true
}
```

Private signer keys and internal RPC URLs are never returned.

## 2. Onboarding: select the first chain

Add `chainUid` to the final onboarding submission.

Issuer:

```http
POST /api/v1/organizations/me/submit
Authorization: Bearer <issuerJwt>
Content-Type: application/json

{
  "walletAddress": "0xIssuerWallet",
  "chainUid": "60000000-0000-4000-8000-000000000001"
}
```

The Issuer ONCHAINID is created on this chain when an administrator approves the organization.

Investor:

```http
POST /api/v1/investors/me/submit
Authorization: Bearer <investorJwt>
Content-Type: application/json

{
  "walletAddress": "0xInvestorWallet",
  "chainUid": "60000000-0000-4000-8000-000000000001"
}
```

The Investor ONCHAINID is created on this chain during submission. Existing clients that omit `chainUid` temporarily use the configured default chain, but new frontend code must always send it.

## 3. Display locked and unlocked chains

After onboarding, load the authenticated user's chain access:

```http
GET /api/v1/chains/me
Authorization: Bearer <jwt>
```

Each item adds:

```json
{
  "isUnlocked": false,
  "identityStatus": "LOCKED",
  "identityAddress": null,
  "identityTransactionHash": null,
  "identityErrorCode": null,
  "identityErrorMessage": null
}
```

Supported UI states:

| `identityStatus` | `isUnlocked` | Frontend action |
|---|---:|---|
| `LOCKED` | false | Show **Unlock chain** |
| `CREATING` | false | Disable the button and show **Creation in progress** |
| `FAILED` | false | Show safe error and allow retry |
| `CREATED` | true | Show **Unlocked** and ONCHAINID address |

## 4. Unlock another chain

```http
POST /api/v1/chains/:chainUid/unlock
Authorization: Bearer <jwt>
```

No body is required. The backend:

1. verifies completed onboarding and the registered wallet;
2. acquires an idempotent per-user/per-chain creation reservation;
3. submits/reuses the ONCHAINID through that chain's configured Identity Factory;
4. stores the identity address and authoritative transaction metadata;
5. marks the chain unlocked only after creation succeeds.

Do not open MetaMask for this operation. The configured platform signer performs ONCHAINID creation. If the API returns `CHAIN_IDENTITY_CREATION_IN_PROGRESS`, keep the chain locked, poll `GET /api/v1/chains/me`, and do not call unlock repeatedly in parallel.

## 5. Select payment tokens by chain

```http
GET /api/v1/payment-tokens?chainUid=<chainUid>&action=PURCHASE
GET /api/v1/payment-tokens?chainUid=<chainUid>&action=REDEMPTION
```

`chainId` may be used instead of `chainUid`, but never send both. The backend returns only tokens that are:

- active in `paymentTokenMaster` for that chain;
- enabled for the requested action; and
- currently returned by that chain's Platform Controller `paymentTokens()` call.

If the on-chain allowlist cannot be verified, the API fails closed with `PAYMENT_TOKEN_REGISTRY_UNAVAILABLE`.

## 6. Token creation

Send the selected `chainUid` in the first token step:

```http
PUT /api/v1/tokens/me/information
Authorization: Bearer <issuerJwt>
Content-Type: multipart/form-data

chainUid=<selectedChainUid>
paymentTokenAddress=<address returned for that chain>
...
```

Rules:

- the Issuer must first unlock the selected chain;
- `paymentTokenAddress` must belong to the same chain;
- the backend assigns the chain's Platform Controller as Token Agent;
- the chain cannot change after token creation starts;
- wallet switching must use the returned `chainId` before deployment;
- send the same `chainId` to transaction confirmation APIs.

## 7. Invest, transfer, redemption, registry, and claims

The wallet execution architecture remains:

```text
User wallet -> selected chain contract -> blockchain
Blockchain event -> chain-specific indexer -> canonical database history
```

For the fast transaction-confirm endpoint, always send the actual wallet chain:

```http
POST /api/v1/investments/transactions/confirm

{
  "chainId": 11155111,
  "txHash": "0x...",
  "tokenUid": "...",
  "expectedAction": "INVEST"
}
```

The backend rejects a transaction when `chainId` does not match the token's stored `chainUid`. The indexers independently recover missed confirmations per chain, so browser refreshes and frontend outages do not lose confirmed events.

Transaction history can be restricted to the selected wallet network with
`GET /api/v1/investments/transactions?chainId=<chainId>`. If omitted, the API returns the
authorized user's activity across every supported chain; each item includes `chainUid`, `chainId`,
`chainName`, `networkName`, `explorerUrl`, and that chain's `requiredConfirmations`.

Identity Registry and claim flows use the Investor and Issuer ONCHAINID records for the token's chain. If either party has not unlocked that chain, the backend returns a chain identity/eligibility error and the UI should direct the user to the chain access screen.

## 8. Wallet network helper

Use `wallet_switchEthereumChain` with the hexadecimal `chainId`. If the wallet reports an unknown chain, use `wallet_addEthereumChain` with:

- `chainId`
- `chainName`
- `nativeCurrencyName`, `nativeCurrencySymbol`, `nativeCurrencyDecimals`
- `publicRpcUrl`
- `explorerUrl`

Never use an internal backend RPC URL.

## 9. Admin chain APIs

All endpoints below require a Super Admin JWT and database permission:

```text
GET    /api/v1/admin/chains
POST   /api/v1/admin/chains
GET    /api/v1/admin/chains/:chainUid
PATCH  /api/v1/admin/chains/:chainUid
PUT    /api/v1/admin/chains/:chainUid/image
GET    /api/v1/admin/chains/:chainUid/audits
```

Create example:

```json
{
  "chainCode": "AMOY",
  "chainName": "Polygon Amoy",
  "chainId": 80002,
  "networkName": "amoy",
  "nativeCurrencyName": "POL",
  "nativeCurrencySymbol": "POL",
  "nativeCurrencyDecimals": 18,
  "rpcUrl": "https://internal-rpc.example",
  "fallbackRpcUrls": ["https://fallback-rpc.example"],
  "publicRpcUrl": "https://public-rpc.example",
  "explorerUrl": "https://amoy.polygonscan.com",
  "identityFactoryAddress": "0x...",
  "platformControllerAddress": "0x...",
  "trexFactoryAddress": "0x...",
  "deployerAddress": "0x...",
  "deployerPrivateKey": "0x...",
  "confirmations": 2,
  "registryConfirmations": 2,
  "deploymentStartBlock": 0,
  "claimIndexerStartBlock": 0,
  "registryIndexerStartBlock": 0,
  "transactionIndexerStartBlock": 0,
  "indexersEnabled": true,
  "isTestnet": true,
  "isDefault": false,
  "isActive": true
}
```

The primary RPC is verified against `chainId` before save. `deployerPrivateKey` is write-only, must match `deployerAddress`, and is encrypted before storage. Admin responses return `hasDeployerPrivateKey`, `hasRpcUrl`, and `fallbackRpcCount`, never the secret values.

After creation the JSON update API accepts only:

```json
{
  "publicRpcUrl": "https://public-rpc.example",
  "explorerUrl": "https://explorer.example",
  "fallbackRpcUrls": ["https://internal-fallback.example"],
  "isActive": true
}
```

All other network fields are immutable. Networks cannot be deleted; use `isActive: false`.
Every actual change is recorded in `chainMasterAudit`. Upload the optional create image as
`multipart/form-data` field `image`, or add/replace it later with the dedicated image endpoint.
When creating a chain as multipart, send `fallbackRpcUrls` and `delegationManagerAddresses` as
JSON-array strings. Images must be PNG, JPEG, WebP, or safe SVG, at most 2 MB, between 256x256
and 4096x4096, and are signature-checked and optimized to metadata-free WebP by the backend.

## 10. Admin payment-token APIs

```text
GET    /api/v1/admin/payment-tokens?chainUid=<uid>
POST   /api/v1/admin/payment-tokens
GET    /api/v1/admin/payment-tokens/:paymentTokenUid
PATCH  /api/v1/admin/payment-tokens/:paymentTokenUid
DELETE /api/v1/admin/payment-tokens/:paymentTokenUid
PUT    /api/v1/admin/payment-tokens/:paymentTokenUid/image
```

Create example:

```json
{
  "chainUid": "60000000-0000-4000-8000-000000000001",
  "paymentTokenCode": "USDC",
  "paymentTokenName": "USD Coin",
  "paymentTokenSymbol": "USDC",
  "contractAddress": "0x...",
  "decimals": 6,
  "supportsPurchase": true,
  "supportsRedemption": true,
  "isDefault": false,
  "displayOrder": 20,
  "isActive": true
}
```

One default payment token is allowed per chain. `supportsPurchase` and `supportsRedemption` are
set during creation and must not be included in PATCH requests. An in-use token cannot move to
another chain or be deleted; disable it instead. Images use multipart field `image` during create
or through the dedicated image endpoint. Public APIs still filter the database list against the
Platform Controller on-chain allowlist.

## 11. Frontend migration checklist

1. Remove hardcoded network/contract/payment-token constants.
2. Load `GET /chains` before onboarding and network selection.
3. Send `chainUid` on Issuer and Investor submission.
4. Add a chain-access screen backed by `GET /chains/me`.
5. Call `POST /chains/:chainUid/unlock` only after explicit user action.
6. Require `isUnlocked === true` before token creation or chain-specific regulated actions.
7. Reload payment tokens whenever the selected chain changes.
8. Store both `chainUid` and `chainId` in frontend state; do not treat them as interchangeable.
9. Switch the wallet network before submitting any transaction.
10. Continue sending `chainId` and `txHash` to the optional fast confirmation endpoint.
11. Keep transaction history/indexer polling; the frontend notification is not the sole source of truth.
12. Handle `CHAIN_LOCKED`, `UNSUPPORTED_CHAIN`, `CHAIN_IDENTITY_CREATION_IN_PROGRESS`, `CHAIN_IDENTITY_CREATION_FAILED`, and `PAYMENT_TOKEN_REGISTRY_UNAVAILABLE` explicitly.
