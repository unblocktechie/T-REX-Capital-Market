# Frontend token creation guide

The token wizard is available only to an authenticated Issuer whose organization has `status: approved`. There is one persisted token form per organization.

## Startup and resume

Load these resources in parallel:

```http
GET /api/v1/token-options
GET /api/v1/locations/countries?page=1&limit=250
GET /api/v1/tokens/me
```

`token-options.claimTopics` is the source of the Step 2 switches. Use each `claimTopicUid` as the submitted identifier and display its `claimTopicName`, `description`, and numeric `value`.

Countries contain:

```ts
type CountryOption = {
  countryUid: string;
  countryCode: string;  // ISO 3166-1 alpha-2 display/reference value
  numericCode: string;  // ISO 3166-1 numeric deployment value, e.g. "840"
  countryName: string;
};
```

Submit only `countryUid` values. The backend resolves and persists `numericCode`; never generate or trust numeric codes from browser state.

Use `data.currentStep` to resume. `status: readyToDeploy` or `deployed` is read-only. A `409` should route the user to review/status instead of opening a new-token form.

## Step 1: Token information

Send `multipart/form-data` to:

```http
PUT /api/v1/tokens/me/information
```

Fields are `tokenName`, `tokenSymbol`, `decimals`, `initialTokenPrice`, `treasuryWalletAddress`, `tokenDescription`, `isDraft`, and optional file part `tokenImage`.

Frontend behavior:

- Trim token name and reject consecutive spaces.
- Token name: 3–50 characters matching `^[A-Za-z0-9][A-Za-z0-9 .'-]{1,48}[A-Za-z0-9]$`.
- Uppercase symbol as the user types; allow only `^[A-Z0-9]{2,10}$`.
- Decimals dropdown contains only 2, 6, 8, and 18.
- Price must be greater than zero.
- Treasury address must be a valid EVM address.
- Completed Step 1 requires an image. A resumed token with `imageUrl` may continue without re-uploading it.
- Client checks improve UX, but the server performs authoritative signature, corruption, dimension, and optimization validation.

Accepted image input: PNG, JPEG, WebP, or SVG; at most 2 MB; 256×256 through 4096×4096. Display the returned optimized image using authenticated `GET /api/v1/tokens/me/image`.

## Step 2: Identity and claims

```http
PUT /api/v1/tokens/me/claims
Content-Type: application/json
```

```json
{
  "claimTopicUids": ["<claimTopicUid>"],
  "organizationActsAsTrustedClaimIssuer": true,
  "isDraft": false
}
```

At least one claim is required when continuing. Multiple selections are allowed. The trusted issuer checkbox must be selected; the backend assigns the approved organization wallet.

## Step 3: Compliance rules

```http
PUT /api/v1/tokens/me/compliance
Content-Type: application/json
```

```json
{
  "maxInvestors": 2000,
  "maxBalancePerInvestor": 10000,
  "countryRestrictionMode": "allowlist",
  "countryUids": ["<countryUid>", "<countryUid>"],
  "isDraft": false
}
```

Use an amount input for `maxBalancePerInvestor`, not a percentage input. It represents the absolute number of tokens one investor may hold, must be greater than zero, and supports up to 18 decimal places. Use a multi-select with unique country UIDs. Completed data requires both holding-limit fields, a mode, and at least one country. Show country names and optionally their three-digit numeric codes.

## Step 4: Governance roles

Pre-fill both fields using `organizationWalletAddress` returned by `GET /tokens/me` or the approved organization form:

```json
{
  "tokenAgentWalletAddress": "0x1111111111111111111111111111111111111111",
  "identityManagerWalletAddress": "0x1111111111111111111111111111111111111111",
  "isDraft": false
}
```

Send to `PUT /api/v1/tokens/me/governance`. Both fields must exactly represent the organization wallet (comparison is case-insensitive).

## Step 5: Final review

Render the final review from `GET /tokens/me`, including:

- Token basics and image
- Claim names and their numeric values
- Maximum investors and absolute maximum token balance per investor
- Restriction mode, country names, and ISO numeric codes
- Trusted issuer, token agent, and identity manager

Call:

```http
POST /api/v1/tokens/me/submit
Content-Type: application/json
```

First send the TREX deployment transaction from the connected frontend wallet and wait for its receipt. Then send the transaction hash to the backend:

```json
{
  "transactionHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Do not send contract addresses from browser state. The backend independently reads the Sepolia receipt, decodes the factory's `TREXSuiteDeployed` event, and returns the authoritative addresses. Success returns `status: deployed` with `platformAgentWallet`, the six suite addresses, `deployTxHash`, `deployedAtBlock`, and `deployedAt`.

If the API returns `422 TOKEN_DEPLOYMENT_VERIFICATION_FAILED`, show `message` to the user and reload `GET /tokens/me`. The stored token will have `status: deploymentFailed` and `contractTxnMessage`; the user may retry deployment. A `deployed` token's creation fields are read-only, but its owning issuer may update `currentTokenPrice` through the dedicated price endpoint below.

## Update deployed token price

Render both `initialTokenPrice` (immutable launch price) and `currentTokenPrice` (editable current
price) for the issuer. Submit only:

```http
PATCH /api/v1/tokens/me/price
Content-Type: application/json
```

```json
{ "currentTokenPrice": 1.25 }
```

Accept only a positive value with up to 18 decimal places. After success, replace local token state
with the response. Never overwrite or send `initialTokenPrice` from this screen. Newly created
purchase, redemption and transfer intents use the new current price; existing transaction rows keep
their stored price snapshot.

## Draft behavior

Every step includes `isDraft`.

- `true`: partial fields and empty claim/country arrays are allowed where structurally valid.
- `false`: all required fields for that step are enforced and `currentStep` advances.
- Final submit revalidates the entire form regardless of earlier step completion.
- `readyToDeploy` and `deployed` reject form mutations with `409`; `deploymentFailed` can be submitted again with a new transaction hash.
