# End-to-end testing guide

The examples use `curl` and assume `BASE_URL=http://localhost:3000`. JSON responses shown are abbreviated; all responses include `success`, `message`, `timestamp`, and `requestId`.

## 1. Install, configure, and start

```bash
npm install
copy .env.example .env
mysql -u root -p < database/trex-capital-market.sql
npm run seed:locations
npm run seed:admin
npm run check
npm test
npm run dev
```

For an existing database, rerun the idempotent main schema and `npm run seed:locations` before starting the updated API.

Expected startup log: `T-REX Capital Market Backend started`. If environment validation, MySQL, or SMTP configuration is invalid, startup fails clearly.

## 2. Health check

```bash
curl http://localhost:3000/api/health
```

Expected: HTTP `200`, `data.status` is `UP`, and UTC `data.utcTimestamp` is present.

## 3. Signup

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup -H "Content-Type: application/json" -d '{"fullName":"Ada Lovelace","email":"ada@example.com","password":"Launch!234","isIssuer":false}'
```

Expected: HTTP `201`, a user UUID with Investor `roleUid` (`00000000-0000-4000-8000-000000000004`), `emailVerified: false`, and no password/hash in the response. Repeat with `isIssuer: true` to confirm Issuer assignment.

## 4. Receive and verify email

Open the email delivered by the configured SMTP server. Its link opens the frontend
`/verify-email?token=...` page. Copy the token and simulate the frontend's explicit
**Verify and continue** action:

```bash
curl -X POST http://localhost:3000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_FROM_EMAIL"}'
```

Expected: HTTP `200`, `emailVerified: true`, an `accessToken`, `tokenType: Bearer`, and
`expiresIn`. Save the returned access token for protected requests. Reusing the token returns
`400` and never issues another JWT.

## 5. Login (optional verification of password login)

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"Launch!234"}'
```

Expected: HTTP `200` with a Bearer JWT. Before verification, the same call returns `403` and `Please verify your email before logging in.`

## 6. Obtain the administrator token

Use the administrator created by `npm run seed:admin`:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"ReplaceMe123!"}'
```

Save `data.accessToken` as `ADMIN_TOKEN`. Use the real values from `.env`.

## 7. Access a protected API

```bash
curl "http://localhost:3000/api/v1/roles?page=1&limit=20&sortBy=roleName&sortOrder=asc" -H "Authorization: Bearer ADMIN_TOKEN"
```

Expected: HTTP `200`, seeded roles, and pagination metadata. Missing JWT returns `401`.

## 8. Confirm permission authorization

Call `/api/v1/menus` with Ada's Investor token. The seeded Investor permission should return `200`. Call `/api/v1/roles` with the same token.

Expected: menu read returns `200`; role administration returns HTTP `403`, code `FORBIDDEN`. Issuer accounts have the same least-privilege menu-read baseline. Use the administrator token to add further API permissions when the product introduces issuer- or investor-specific protected endpoints.

## 9. Forgot password

```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"ada@example.com"}'
```

Expected for a registered active account: HTTP `200` and a reset email. An unregistered email returns HTTP `404` with `This email is not registered. Please sign up first.` An inactive account returns HTTP `403`.

## 10. Validate and reset

```bash
curl "http://localhost:3000/api/v1/auth/verify-reset-token?token=TOKEN_FROM_EMAIL"
curl -X POST http://localhost:3000/api/v1/auth/reset-password -H "Content-Type: application/json" -d '{"token":"TOKEN_FROM_EMAIL","newPassword":"NewLaunch!567"}'
```

Expected: token validation `200`, reset `200`, then token reuse `400`.

## 11. Log in with the new password

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"NewLaunch!567"}'
```

Expected: HTTP `200`. The old password returns `401`.

## 12. Role CRUD

```bash
curl -X POST http://localhost:3000/api/v1/roles -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"roleName":"Operations","description":"Launch operations","isActive":true}'
curl -X PUT http://localhost:3000/api/v1/roles/ROLE_UID -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"description":"Updated operations team"}'
curl http://localhost:3000/api/v1/roles/ROLE_UID -H "Authorization: Bearer ADMIN_TOKEN"
curl -X DELETE http://localhost:3000/api/v1/roles/ROLE_UID -H "Authorization: Bearer ADMIN_TOKEN"
```

Expected: `201`, `200`, `200`, `200`; a subsequent get returns `404`.

## 13. Menu CRUD

Repeat create/list/get/update/delete on `/api/v1/menus` using:

```json
{ "menuName": "Launches", "menuCode": "LAUNCHES", "routePath": "/launches", "displayOrder": 10, "isVisible": true, "isActive": true }
```

Expected: the same CRUD status sequence. Confirm `?search=Launch&isVisible=true&sortBy=displayOrder` filters the list.

## 14. Permission CRUD

Repeat CRUD on `/api/v1/permissions` using:

```json
{ "roleUid": "ROLE_UID", "menuUid": "MENU_UID", "permissionName": "List launches", "permissionCode": "LAUNCH_LIST", "httpMethod": "GET", "apiPath": "/api/v1/launches", "isAllowed": true, "isActive": true }
```

Expected: the permission becomes effective on the next matching request; no service restart is needed.

## 15. General-settings CRUD

Repeat CRUD on `/api/v1/general-settings` using:

```json
{ "settingKey": "application.pageSize", "settingValue": "25", "valueType": "number", "settingGroup": "application", "isPublic": true, "isActive": true }
```

Then call:

```bash
curl http://localhost:3000/api/v1/general-settings/public
```

Expected: `application.pageSize` is returned as number `25`. After soft delete or `isPublic: false`, it is absent.

## 16. Organization onboarding flow

Use a verified issuer account (`isIssuer: true`) and save its login token as `ISSUER_TOKEN`. An Investor token must receive `403` for all `/organizations/*` endpoints.

First load the reference values and copy the required UIDs:

```bash
curl "http://localhost:3000/api/v1/organization-options"
curl "http://localhost:3000/api/v1/locations/countries?search=United%20States"
curl "http://localhost:3000/api/v1/locations/countries/COUNTRY_UID/states?search=California"
curl "http://localhost:3000/api/v1/locations/states/STATE_UID/cities?search=San%20Francisco"
```

Save a partial draft:

```bash
curl -X PUT http://localhost:3000/api/v1/organizations/me/company-information -H "Authorization: Bearer ISSUER_TOKEN" -H "Content-Type: application/json" -d '{"legalCompanyName":"Acme Financial Holdings Ltd.","isDraft":true}'
```

Expected: `200`, `status: draft`. Repeat with all company fields and `isDraft: false`, then save the jurisdiction and beneficial-owner payloads from `docs/API.md`.

Upload each required document type returned by `/organization-options`:

```bash
curl -X POST http://localhost:3000/api/v1/organizations/me/documents -H "Authorization: Bearer ISSUER_TOKEN" -F "documentTypeUid=DOCUMENT_TYPE_UID" -F "documents=@C:/path/to/document.pdf"
```

Multiple `documents=@...` parts are accepted in one call. Verify list, download, and delete:

```bash
curl http://localhost:3000/api/v1/organizations/me/documents -H "Authorization: Bearer ISSUER_TOKEN"
curl http://localhost:3000/api/v1/organizations/me/documents/DOCUMENT_UID/download -H "Authorization: Bearer ISSUER_TOKEN" --output downloaded-document.pdf
curl -X DELETE http://localhost:3000/api/v1/organizations/me/documents/DOCUMENT_UID -H "Authorization: Bearer ISSUER_TOKEN"
```

Finally submit:

```bash
curl -X POST http://localhost:3000/api/v1/organizations/me/submit -H "Authorization: Bearer ISSUER_TOKEN" -H "Content-Type: application/json" -d '{"walletAddress":"0x1111111111111111111111111111111111111111"}'
```

Expected: `200`, the normalized submitted wallet address, `status: submitted`, `isDraft: false`, and a UTC `submittedAt`. Missing or invalid wallet addresses return `422`. Using a wallet already assigned to an Investor returns `409 WALLET_ALREADY_ASSIGNED_TO_INVESTOR`. Using another issuer organization's wallet from a new email returns `409 ISSUER_WALLET_ALREADY_REGISTERED`. Conversely, investor submission with an existing issuer organization wallet returns `409 WALLET_ALREADY_ASSIGNED_TO_ISSUER`. These conflicts must occur before blockchain identity creation or onboarding submission. Missing organization fields, invalid location relationships, owners under 18, beneficial ownership that does not total exactly 100%, or missing required document types return a standardized `400`; invalid file type/size returns `422`. Individual owners may hold less than 25%.

Mark the current issuer as notified:

```bash
curl -X PATCH http://localhost:3000/api/v1/organizations/me/user-notified -H "Authorization: Bearer ISSUER_TOKEN"
```

Expected: `200` and `data.isUserNotified` is `true`/`1`. Repeated calls remain successful. An issuer without an organization receives `404`.

## 17. Admin review and one-time rejection retry

List pending submissions using `ADMIN_TOKEN`:

```bash
curl "http://localhost:3000/api/v1/admin/organizations?page=1&limit=20&status=submitted&sortBy=submittedAt&sortOrder=desc" -H "Authorization: Bearer ADMIN_TOKEN"
curl "http://localhost:3000/api/v1/admin/organizations/ORGANIZATION_UID" -H "Authorization: Bearer ADMIN_TOKEN"
```

Preview or download a document UID returned by the detail API:

```bash
curl "http://localhost:3000/api/v1/admin/organizations/ORGANIZATION_UID/documents/DOCUMENT_UID/file" -H "Authorization: Bearer ADMIN_TOKEN" --output preview.pdf
curl "http://localhost:3000/api/v1/admin/organizations/ORGANIZATION_UID/documents/DOCUMENT_UID/file?disposition=attachment" -H "Authorization: Bearer ADMIN_TOKEN" --output downloaded-document.pdf
```

Expected: `200`; preview uses `Content-Disposition: inline`, download uses `attachment`. A document from another organization or missing stored file returns `404`.

First rejection:

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/organizations/ORGANIZATION_UID/status -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"rejected","rejectionReason":"Please replace the expired incorporation document."}'
```

Expected: `status: rejected`, `rejectionCount: 1`, and `canResubmit: true`. `GET /organizations/me` returns the same reason. The issuer can edit and submit once using the normal onboarding APIs.

After the issuer submits the revision, expect `status: resubmitted`. Admin lists can filter with `status=resubmitted`. Reject that resubmitted application again with a new reason. Expected: `rejectionCount: 2`, `canResubmit: false`. Company, jurisdiction, UBO, document mutation, and submit endpoints now return `409` with Contact Sales guidance.

Approval example:

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/organizations/ORGANIZATION_UID/status -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"approved"}'
```

Before testing, configure `SEPOLIA_RPC_URL`, `IDENTITY_FACTORY_ADDRESS`, `DEPLOYER_PRIVATE_KEY`, and `DEPLOYER_ADDRESS` with a funded Sepolia deployer. Never use the exposed sample key; rotate it first.

Expected after a new identity transaction: `200`, `status: approved`, `canResubmit: false`, `rejectionReason: null`, and populated `contractAddress`, `contractTxnHash`, and `contractTxnMessage`. Repeating safely after an identity already exists reuses the factory result and may return a null transaction hash.

To test failure handling, temporarily use an unfunded test deployer or invalid factory address and approve a still-submitted application. Expected: `502`, error code `ORGANIZATION_IDENTITY_CREATION_FAILED`, and `error.details.contractTxnMessage`. Fetch the application again; its status must still be `submitted`, `resubmitted`, or `underReview`, while `contractTxnMessage` and any available `contractTxnHash` are retained for diagnosis.

## 18. Token creation flow

Prerequisite: complete the organization flow and approve it successfully. Use the approved issuer's `ISSUER_TOKEN`. Investor accounts and issuers without approved organizations receive `403` or `409`.

Load claim topics, supported decimals, and countries:

```bash
curl http://localhost:3000/api/v1/token-options
curl "http://localhost:3000/api/v1/locations/countries?search=United%20States"
```

Expected: claim-topic values include `1` for KYC and `2` for Accredited Investor. Country responses include `numericCode: "840"` for the United States.

Save Step 1 with a valid image:

```bash
curl -X PUT http://localhost:3000/api/v1/tokens/me/information \
  -H "Authorization: Bearer ISSUER_TOKEN" \
  -F "tokenName=Acme Security Token" \
  -F "tokenSymbol=trex" \
  -F "decimals=18" \
  -F "initialTokenPrice=1.00" \
  -F "treasuryWalletAddress=ORGANIZATION_WALLET_ADDRESS" \
  -F "tokenDescription=Institutional security token" \
  -F "isDraft=false" \
  -F "tokenImage=@C:/path/to/token-logo.png"
```

Expected: `tokenSymbol: TREX`, `currentStep: claims`, optimized `imageMimeType: image/webp`, dimensions, checksum, and `imageVirusScanStatus`. Test PNG, JPEG, WebP, and safe SVG. Spoof the MIME/signature, upload a corrupt file, exceed 2 MB, or use dimensions outside 256–4096; each must return `422`.

Save claims:

```bash
curl -X PUT http://localhost:3000/api/v1/tokens/me/claims \
  -H "Authorization: Bearer ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"claimTopicUids":["CLAIM_TOPIC_UID"],"organizationActsAsTrustedClaimIssuer":true,"isDraft":false}'
```

Expected: at least one selection and `trustedClaimIssuerWalletAddress` equal to the approved organization wallet. Empty completed selections, inactive UIDs, or a false trusted-issuer flag return `400`.

Save compliance:

```bash
curl -X PUT http://localhost:3000/api/v1/tokens/me/compliance \
  -H "Authorization: Bearer ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxInvestors":2000,"maxBalancePerInvestor":10000,"countryRestrictionMode":"allowlist","countryUids":["COUNTRY_UID"],"isDraft":false}'
```

Expected: the response restriction includes the authoritative three-digit `iso3166NumericCode`. Multiple unique countries are supported.

Save governance with the organization address as Identity Manager. The Token Agent is assigned by
the backend from `PLATFORM_CONTROLLER_ADDRESS`:

```bash
curl -X PUT http://localhost:3000/api/v1/tokens/me/governance \
  -H "Authorization: Bearer ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"identityManagerWalletAddress":"ORGANIZATION_WALLET_ADDRESS","isDraft":false}'
```

Expected: the response contains
`tokenAgentWalletAddress: 0x9BEFDF75Dc94bbB36532c5d7A74daab28714f579`. A different valid
Identity Manager wallet must return `400`. A legacy client-supplied Token Agent is ignored.

Review and submit:

```bash
curl http://localhost:3000/api/v1/tokens/me -H "Authorization: Bearer ISSUER_TOKEN"
curl http://localhost:3000/api/v1/tokens/me/image -H "Authorization: Bearer ISSUER_TOKEN" --output token.webp
curl -X POST http://localhost:3000/api/v1/tokens/me/submit \
  -H "Authorization: Bearer ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transactionHash":"0xPASTE_64_HEX_CHARACTER_DEPLOYMENT_HASH"}'
```

Before submitting, configure `TREX_FACTORY_ADDRESS` with the Sepolia TREX factory used by the frontend. Expected: `status: deployed`, `currentStep: deployed`, `isDraft: false`, all deployment addresses and block metadata populated, and all later mutation attempts return `409`. The unique organization constraint prevents another token row.

Failure check: submit a confirmed failed transaction or a successful hash without the configured factory's `TREXSuiteDeployed` event. Expected: `422 TOKEN_DEPLOYMENT_VERIFICATION_FAILED`; `GET /tokens/me` then returns `status: deploymentFailed`, the attempted `deployTxHash`, and a diagnostic `contractTxnMessage`. A new valid transaction hash can be submitted afterward.

Draft checks: repeat any step with `isDraft: true` and partial fields/empty arrays. Expect `200` and no step advance. Final submit must still reject incomplete data.

## 19. Hybrid investor claim confirmation and Retry

Prerequisites: an investor application in `verifiedByIssuer`, an investor ONCHAINID, an issuer
ONCHAINID, and at least one `SIGNED` issuer claim. Use the investor JWT.

1. List claims and copy a `claimId`:

   ```bash
   curl "http://localhost:3000/api/v1/investor/claims?interestId=INTEREST_UID" -H "Authorization: Bearer INVESTOR_TOKEN"
   ```

2. Prepare the existing logical submission:

   ```bash
   curl -X POST http://localhost:3000/api/v1/investor/claims/CLAIM_ID/prepare -H "Authorization: Bearer INVESTOR_TOKEN" -H "Content-Type: application/json" -d '{"interestId":"INTEREST_UID"}'
   ```

   Expected: `201`, `status: PENDING`, wallet call parameters, and one database row. Record the
   returned `submissionUid`.

3. Submit the ONCHAINID transaction from the frontend wallet, then post the real hash:

   ```bash
   curl -X POST http://localhost:3000/api/v1/investor/claims/CLAIM_ID/submit -H "Authorization: Bearer INVESTOR_TOKEN" -H "Content-Type: application/json" -d '{"interestId":"INTEREST_UID","txHash":"0x64_HEX_CHARACTERS"}'
   ```

   Expected: `200 CONFIRMED`, or `202 PENDING_CONFIRMATION` until mined. Repeating the request must
   not create another row or transaction.

4. Test failed browser handoff: prepare another claim, successfully submit it on-chain, but do not
   call `/submit`. Call Retry instead:

   ```bash
   curl -X POST http://localhost:3000/api/v1/investor/claims/CLAIM_ID/retry -H "Authorization: Bearer INVESTOR_TOKEN" -H "Content-Type: application/json" -d '{"interestId":"INTEREST_UID"}'
   ```

   Expected: immediate `CONFIRMED` if the global event ledger already has the event; otherwise
   HTTP `202` with `status: SYNCING`. Poll the list or Retry endpoint after a worker pass. The same
   row must become `CONFIRMED` with the actual event transaction hash.

5. Prepare a claim without submitting it on-chain, then Retry. Expected:
   `200 TRANSACTION_REQUIRED`; only now should the frontend request MetaMask submission.

6. Verify operational state:

   ```sql
   SELECT indexerName, chainId, startBlock, lastIndexedBlock, lastSuccessAt, lastErrorMessage
   FROM blockchainIndexerCheckpoint WHERE indexerName = 'investorClaim';

   SELECT processingStatus, COUNT(*) FROM investorClaimBlockchainEvent GROUP BY processingStatus;

   SELECT submissionUid, status, txHash, syncStatus, preparedAtBlock, lastScannedBlock, syncAttempts
   FROM investorClaimSubmission WHERE interestUid = 'INTEREST_UID';
   ```

   The checkpoint must advance only through the configured safe head. There must be no duplicate
   `(interestUid, claimSignatureUid)` row and no duplicate `(chainId, txHash, logIndex)` event.

## Identity Registry registration

1. Use an issuer-owned subscription with status `claimSubmitted`, then call
   `POST /api/v1/investments/issuer/interests/{interestUid}/registry-registration` with `{}`.
2. Assert `201`, `status: PENDING`, and `txHash: null`; save `registryOperationId`. Repeating the
   request must return the same operation with `200`.
3. In MetaMask, use the stored issuer wallet and the backend-returned registry, investor wallet,
   ONCHAINID, and country values in `registerIdentity`.
4. Send only the hash to `POST .../registry-registration/{registryOperationId}/confirm`.
   MetaMask may submit a direct registry transaction or wrap it through an address configured in
   `REGISTRY_DELEGATION_MANAGER_ADDRESSES`; both must independently verify the exact nested registry,
   issuer sender, investor, ONCHAINID, country, receipt event, canonical block and final state.
5. `202` means wait/poll. A `200` response is complete only when `data.status` is `CONFIRMED`.
   Confirm that `tokenInvestmentInterest.status = 'registered'` and exactly one corresponding
   `tokenInvestmentInterestHistory.eventType = 'registered'` row exists.
6. Negative checks using another issuer, sender, registry, wallet, identity, country, reverted
   receipt, missing event, or mismatching final state must leave the row `PENDING`.
7. Frontend-crash check: prepare and submit on-chain, but omit confirm. The worker must reconcile
   the existing row using the actual event hash without creating a row or transaction.
8. Inspect `identityRegistryBlockchainEvent` and this global cursor:

   ```sql
   SELECT * FROM blockchainIndexerCheckpoint
   WHERE indexerName = 'identityRegistryRegistration';

   SELECT interestUid, status FROM tokenInvestmentInterest WHERE interestUid = 'INTEREST_UID';

   SELECT eventType, actorRole, actorUserUid, note, createdAt
   FROM tokenInvestmentInterestHistory
   WHERE interestUid = 'INTEREST_UID' AND eventType = 'registered';
   ```

## Frontend wallet transaction and fallback indexer

1. Apply `database/migrations/20260911_add_canonical_blockchain_transactions.sql`, configure
   `PLATFORM_CONTROLLER_ADDRESS`, payment token, RPC, chain ID, confirmation count, and the earliest
   required `TRANSACTION_INDEXER_START_BLOCK`.
2. Invest: from the registered investor wallet, approve live USDT allowance when needed and call
   `PlatformController.buy(tokenAddress, tokenAmountRaw)`. The backend must not be required for
   either wallet transaction.
3. Submit the resulting hash to `POST /api/v1/investments/transactions/confirm` with chain ID,
   token UID, and `expectedAction=INVEST`. Verify exact sender, controller target/function, token,
   issue event, USDT event/direction, controller quote, canonical block, and confirmations. Expect
   `SUBMITTED` until safe and then `CONFIRMED`.
4. Transfer: call token `transfer()` directly, then use the same endpoint with
   `expectedAction=TRANSFER`. Verify the exact event values are decoded from chain data.
5. Redemption: complete the off-chain request and issuer decision, approve issuer USDT allowance,
   then call `PlatformController.redeem()` from the investor wallet. Confirm it with
   `expectedAction=REDEMPTION`; verify atomic burn and issuer-to-investor settlement.
6. Repeat every confirmation call and re-index each block. Confirm only one row exists per
   `(chainId, transactionHash, type)` and no duplicate legacy transition/history is created.
7. Stop the backend, execute one transaction, restart, and verify `canonicalTransactions` resumes
   from `blockchainIndexerCheckpoint`, finds the missed event, and creates the same `CONFIRMED` row.
8. Test a token added after the global checkpoint advanced. Verify `blockchainIndexedContract`
   backfills from its deployment block without rewinding all other contracts.
9. Test wrong chain, sender, target, function, token, quote, event, reverted receipt, fake hash, and
   block-hash mismatch. None may become `CONFIRMED`. A transient RPC/database failure must not
   advance the affected checkpoint range.
10. Test role scope and CSV export: investors see their wallet only, issuers see their organizations
    only, Super Administrator sees all, and exports respect every filter.

The sections below describe read-only legacy tables retained during production-data migration.
Their transaction-orchestration POST endpoints and runners are retired.

## Legacy investor token purchase and mint settlement

1. Configure Sepolia RPC, platform signer, and `PURCHASE_USDT_ADDRESS`. Confirm the platform wallet
   is a Token Agent for the deployed token and use an investor interest with status `registered`.
2. Create an intent:

   ```bash
   curl -X POST http://localhost:3000/api/v1/investments/tokens/TOKEN_UID/purchases \
     -H "Authorization: Bearer INVESTOR_TOKEN" -H "Content-Type: application/json" \
     -d '{"tokenAmount":"10.25","idempotencyKey":"checkout-20260910-0001"}'
   ```

   Expect `201 PENDING_PAYMENT`. Repeat the same key and expect the same row. Copy the returned
   USDT contract, treasury address, and `usdtAmountRaw` exactly.
3. From the registered investor wallet, call USDT `transfer(treasuryWalletAddress,
   usdtAmountRaw)` in MetaMask. Send only the resulting hash:

   ```bash
   curl -X POST http://localhost:3000/api/v1/investments/purchases/PURCHASE_UID/confirm \
     -H "Authorization: Bearer INVESTOR_TOKEN" -H "Content-Type: application/json" \
     -d '{"txHash":"0xPAYMENT_HASH"}'
   ```

   With both purchase confirmation settings at `1`, normally expect `COMPLETED` from the same API
   request. Confirm that `mint.txHash`, block number/hash, transaction index, log index, gas used,
   effective gas price and confirmation timestamp are populated. Confirm always returns HTTP `200`
   for a persisted lifecycle result; `data.status` shows whether verification/minting is pending.
4. If step 3 returns `PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, or `MINT_SUBMITTED`, poll
   `GET /api/v1/investments/purchases/PURCHASE_UID`. The worker verifies the already-submitted mint
   and progresses it to `COMPLETED`. While waiting, expect `syncStatus: QUEUED`, transaction-history
   status `PENDING`, and no purchase error.
5. Negative checks: wrong sender, USDT contract, treasury, amount, function, reverted receipt,
   reused hash, unregistered interest, inactive token, and an amount over the holder cap must not
   confirm or mint.
6. Missing-payment-hash recovery: create intent, transfer USDT, omit confirm, and wait. The global
   USDT indexer must match and verify the exact stored intent.
7. Missed-mint-hash recovery: after `mintPreparedAtBlock` is stored, simulate a process crash after
   broadcast. The targeted token event scan must recover the zero-address Transfer hash without a
   second mint.
8. Inspect audit state:

   ```sql
   SELECT status, paymentTxHash, paymentVerifiedAt, mintStatus, mintTxHash, mintConfirmedAt,
          errorStage, errorCode, syncStatus, syncAttempts
   FROM tokenPurchase WHERE purchaseUid = 'PURCHASE_UID';

   SELECT stage, txHash, status, blockNumber, blockHash, logIndex, gasUsed, confirmedAt
   FROM tokenPurchaseTransaction WHERE purchaseUid = 'PURCHASE_UID' ORDER BY createdAt;

   SELECT * FROM blockchainIndexerCheckpoint WHERE indexerName = 'tokenPurchasePayment';
   ```

9. Fetch `GET /api/v1/investments/tokens/TOKEN_UID/purchases?page=1&limit=20&search=&status=all` with the investor
   token. Expect only that investor's rows for the selected token, newest first, and verify
   `meta.page`, `meta.limit`, `meta.total`, and `meta.totalPages`. Repeat with
   `status=COMPLETED`, `status=EXPIRED`, a transaction-hash `search`, and an amount `search`.

10. Test an abandoned MetaMask payment. Create a purchase but do not call Confirm. For a quick local
   test, set `PURCHASE_INTENT_TTL_MINUTES=1`, set `PurchaseIntentExpiryGraceSeconds` to `0`, restart
   the backend, and wait for the purchase worker. Once the global USDT checkpoint reaches the safe
   head, expect the row to become `EXPIRED`, with `expiredAt` populated and
   `expirationReason='PAYMENT_NOT_SUBMITTED'`. Confirm must return HTTP `200` with the current
   `EXPIRED` state; Retry must return `409 PURCHASE_EXPIRED`. Creating a fresh purchase with a new
   idempotency key must succeed.

   Also verify safety: submit a valid payment hash before the deadline and confirm that the runner
   never expires that row, even if settlement remains queued. To simulate backend downtime, stop
   the server after creating the intent, let the deadline pass, then restart it. The worker must
   first catch the USDT indexer up; it expires the row only after catch-up and event matching.

11. Apply `database/migrations/20260910_add_investor_portfolio_permission.sql` and call
    `GET /api/v1/investments/me/portfolio?page=1&limit=20&search=`. Expect only tokens with at least
    one `COMPLETED` purchase for the authenticated investor. Verify token name, symbol, image URL,
    token/registry addresses, chain ID, issuer, restrictions, required claims, purchase totals, USDT
    totals, completed-redemption totals, net token amount, average price, counts, and dates. Search
    by token name, symbol, token address, and issuer company. Confirm a second investor cannot see
    the first investor's portfolio.

## Legacy manual token redemption settlement

1. Apply `database/migrations/20260910_add_token_redemption_flow.sql`, configure the redemption
   environment values, and restart the API so the redemption worker starts.
2. With a registered investor token, create a redemption for an amount below the investor's
   unfrozen on-chain balance. Repeat the same idempotency key and verify the same `redemptionUid`
   is returned.
3. Sign the returned EIP-712 `authorization.typedData` with the registered investor wallet and call
   Authorize. Verify a different wallet signature and an expired signature both return `422`.
4. With the owning issuer token, list/detail the request and approve it. Verify another issuer gets
   `404`. Poll until the platform lock has 2 confirmations and status is `TOKENS_LOCKED`.
5. From the exact `issuerPaymentWalletAddress`, call USDT `transfer(investorWalletAddress,
   usdtAmountRaw)`. Submit only the hash to the payment-confirm endpoint. Wrong sender, recipient,
   amount, contract, reverted receipt, and non-canonical block must never advance payment.
6. Poll through `PAYMENT_CONFIRMED`, `BURN_SUBMITTED`, optional `BURN_CONFIRMED` /
   `UNLOCK_SUBMITTED`, and `COMPLETED`. Verify lock, payment, burn, and cleanup receipt metadata in
   detail and the append-only transaction/history tables.
7. Test frontend-crash recovery by paying successfully without calling Confirm. The global
   `tokenRedemptionPayment` indexer must match the exact Transfer and continue the same row.
8. Test backend-crash recovery around each platform action. A prepared action with no persisted hash
   must search for its exact event before rebroadcast. No duplicate redemption or deliberate
   duplicate platform transaction may be created.
9. Cancel before approval (immediate), after a confirmed lock (`CANCELLATION_PENDING` followed by
   verified unlock), and after payment submission (`409 REDEMPTION_CANCELLATION_NOT_ALLOWED`).
10. Inspect audit state:

   ```sql
   SELECT status, lockStatus, paymentStatus, burnStatus, unlockStatus,
          lockTxHash, paymentTxHash, burnTxHash, unlockTxHash, errorCode, syncStatus
   FROM tokenRedemption WHERE redemptionUid = 'REDEMPTION_UID';

   SELECT stage, txHash, status, blockNumber, blockHash, logIndex, confirmedAt
   FROM tokenRedemptionTransaction WHERE redemptionUid = 'REDEMPTION_UID' ORDER BY createdAt;

   SELECT * FROM tokenRedemptionHistory WHERE redemptionUid = 'REDEMPTION_UID' ORDER BY createdAt;
   SELECT * FROM blockchainIndexerCheckpoint WHERE indexerName IN ('tokenRedemptionPayment','platformTokenAgentExecution');
   ```

## Investor invitations

1. Apply `database/migrations/20260910_add_investor_invitations.sql` and confirm `FRONTEND_URL` and
   SMTP settings point to the frontend and test mailbox.
2. Finish one investor profile and leave another as a draft. As the issuer, call
   `GET /api/v1/investments/issuer/investors?tokenUid=TOKEN_UID&page=1&limit=20&invitationStatus=all`.
   Expect only the submitted profile; verify search by name, email, wallet, and profile reference.
3. Try a token belonging to another issuer, a non-deployed token, and an investor excluded by the
   token's country rules. Expect stable 404/409 errors and no invitation row.
4. Invite the eligible investor with
   `POST /api/v1/investments/issuer/investors/INVESTOR_UID/invitations` and
   `{ "tokenUid": "TOKEN_UID" }`. Expect HTTP `201`, `status=SENT`, `emailStatus=SENT`, and one
   styled email whose button is `{FRONTEND_URL}/app/marketplace/{tokenUid}`.
5. Repeat the same request and send two concurrent requests. Expect the same `invitationUid`, HTTP
   `200` for already-sent state, and only one accepted SMTP email.
6. Temporarily make SMTP fail. Expect `502 INVITATION_EMAIL_FAILED` and one row with `PENDING / FAILED`.
   Restore SMTP and retry; expect the same row to become `SENT`, not a second row.
7. As the invited investor, list and get the invitation. Verify it contains the marketplace token
   fields, country restrictions, required claim topics, issuer organization data, and marketplace URL.
   Another investor must receive `INVITATION_NOT_FOUND` for the detail UID.
8. Call `PATCH /api/v1/investments/me/invitations/INVITATION_UID/viewed` twice with `{}`. Both calls
   return `200`, the state remains `VIEWED`, and `viewedAt` is written only once.
9. Verify persistence:

   ```sql
   SELECT invitationUid, organizationUid, tokenUid, investorUid, status, emailStatus,
          emailAttempts, emailMessageId, sentAt, viewedAt, createdAt, updatedAt
   FROM investorInvitation
   WHERE invitationUid = 'INVITATION_UID';
   ```

## Legacy investor token transfer

1. Apply `database/migrations/20260911_add_token_transfer_flow.sql`, configure the transfer
   environment variables, and restart the API so the transfer worker starts.
2. Prepare two submitted investor profiles with ONCHAINIDs and `registered` interests for the same
   deployed token. Give the sender enough unfrozen tokens and keep the recipient below the holder cap.
3. Create the intent with `POST /api/v1/investments/tokens/TOKEN_UID/transfers`. Expect HTTP `201`,
   `status=PENDING_TRANSFER`, normalized addresses, raw amount, expiry, and an authoritative
   `transactionRequest`. Repeating the idempotency key must return the same row.
4. Negative creation checks: recipient missing/incomplete/not registered, self-transfer, paused
   token, wrong Identity Registry or ONCHAINID, frozen/insufficient balance, failed `canTransfer`,
   holder-cap overflow, invalid amount precision, and another active sender/token intent.
5. From the exact sender wallet call the returned token `transfer(recipient, amountRaw)`. Send only
   its hash to `POST /api/v1/investments/transfers/TRANSFER_UID/confirm`.
6. Expect HTTP `200`. `data.status=COMPLETED` is final; `PENDING_TRANSFER` means poll Detail/Retry.
   Verify hash, block number/hash, transaction/log indexes, gas values, verified time, and before/after
   balances are stored. Repeat the same hash and confirm idempotency.
7. Negative confirmation checks: another chain, token contract, sender, recipient, amount, function,
   native value, reverted receipt, missing event, reused hash, and a non-canonical block. None may
   produce `COMPLETED`.
8. Frontend-crash recovery: create and successfully transfer, but omit Confirm. The global indexer
   must store the event and confirm the existing row with the actual event hash.
9. Backend-crash recovery: submit Confirm, stop the backend after hash persistence, restart, and
   verify the worker completes the same row without another wallet transaction.
10. Abandon MetaMask without submitting. After TTL, grace, and global safe-head catch-up, expect
    `EXPIRED`. A genuine event in the safe ledger must prevent expiration.
11. Verify sent/received history with search, every status, and `direction=sent|received|all`. Sender
    and recipient may view detail; an unrelated investor must receive `404`.
12. Inspect durable state:

    ```sql
    SELECT status, txHash, blockNumber, blockHash, transactionIndex, logIndex,
           gasUsed, effectiveGasPrice, syncStatus, syncAttempts, errorCode
    FROM tokenTransfer WHERE transferUid = 'TRANSFER_UID';

    SELECT txHash, status, blockNumber, blockHash, logIndex, errorCode
    FROM tokenTransferTransaction WHERE transferUid = 'TRANSFER_UID' ORDER BY createdAt;

    SELECT processingStatus, matchedTransferUid, txHash, blockNumber, logIndex
    FROM tokenTransferBlockchainEvent WHERE matchedTransferUid = 'TRANSFER_UID';

    SELECT * FROM blockchainIndexerCheckpoint WHERE indexerName = 'tokenTransfer';
    ```

## Current token price

1. Apply `database/migrations/20260911_add_current_token_price.sql` and confirm every existing token
   has `currentTokenPrice = initialTokenPrice`.
2. Log in as the issuer who owns an active deployed token and call `PATCH /api/v1/tokens/me/price`
   with `{ "currentTokenPrice": 2.25 }`. Expect HTTP `200`; verify `currentTokenPrice` changed and
   `initialTokenPrice` did not.
3. Attempt the same route as an investor or another issuer. Expect authorization/not-found denial,
   and verify no token row changed.
4. Create a purchase and redemption after the update. Their stored `tokenPrice` and calculated USDT
   amounts must use `2.25`. Create a transfer and verify its stored `tokenPrice` is `2.25`.
5. Change the current price again. Existing transaction rows must retain `2.25`; only newly created
   intents use the later price.
