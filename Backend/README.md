# T-REX Capital Market Backend

A production-oriented Node.js, Express, and MySQL API foundation for T-REX Capital Market. It is a fresh implementation organized into controllers, services, repositories, schemas, middleware, dependency composition, and shared infrastructure.

## Features

- Issuer/investor signup role selection, one-time POST email verification with immediate JWT login, password login, forgot/reset password, and JWT authentication
- API-level role-based access control loaded from `permissionMaster`
- Hybrid ONCHAINID claim synchronization: receipt verification, a global checkpointed multi-identity indexer, fast Retry, and targeted recovery
- CRUD APIs for users, roles, menus, permissions, and general settings
- Issuer-only organization onboarding with company, jurisdiction, beneficial-owner, document, draft, and final-submission steps
- Backend-authoritative Identity Registry registration with strict transaction/event/state verification and hybrid recovery
- Administrator organization review with OnchainID creation before approval, rejection reasons, and one controlled issuer revision cycle
- Approved-issuer token creation drafts with claim topics, ISO 3166-1 numeric country rules, backend-authoritative Platform Controller Token Agent, governance-wallet validation, and deployment readiness
- Signature-verified token images re-encoded to optimized metadata-free WebP, with optional ClamAV scanning
- Searchable country, state, and city reference APIs with validated parent-child relationships
- Multiple PDF/PNG/JPG organization uploads with file-size limits, checksums, secure storage names, download, and soft delete
- Pagination, search, sorting, filtering, validation, soft deletion, and camelCase database naming
- Parameterized MySQL repositories with lazy pooling and transactions
- CORS allowlist, Helmet headers, compression, API/auth rate limits, and request IDs
- Daily structured file logs under `public/logs/YYYY-MM-DD`
- Responsive HTML/plain-text SMTP messages with attachment support in the shared mail service
- Swagger UI at `/api-docs` and health checks at `/api/health` and `/api/v1/health`

## Project layout

```text
database/                    MySQL schema and seed data
docs/                        OpenAPI spec, payload reference, testing guide
scripts/                     Syntax check and administrator seed
src/
  api/v1/controllers/        Thin HTTP controllers
  api/v1/routes/             Versioned route composition
  config/                    Shared constants
  core/config/               Environment parsing and validation
  core/errors/               API errors and global error normalization
  database/                  MySQL pool and transaction helpers
  dependencies/              Dependency composition root
  middleware/                Security, auth, RBAC, validation, logging
  repositories/              Parameterized data-access layer
  schemas/                   Joi body/query/parameter schemas
  services/                  Business and shared infrastructure services
  utils/                     Response, token, and async helpers
tests/                       Unit and HTTP integration tests
```

## Quick start

Requirements: Node.js 20+, MySQL 8+, and an SMTP account.

```bash
npm install
copy .env.example .env
mysql -u root -p < database/trex-capital-market.sql
npm run seed:locations
npm run seed:admin
npm run dev
```

Edit `.env` before running the schema/seed. Generate a strong JWT secret, use a strong one-time administrator password, and remove `ADMIN_PASSWORD` from `.env` after seeding.

`seed:locations` imports the bundled ISO country/state/city dataset into the location master tables and can safely be rerun. Existing installations should rerun the idempotent main schema, then run `npm run seed:locations`; the organization tables, form options, menu, and issuer permissions are added without deleting existing data.

Existing installations can apply `database/migrations/20260907_add_issuer_investor_roles.sql` to add the Issuer and Investor roles and their least-privilege menu-read permissions.
Apply `database/migrations/20260907_add_organization_user_notified.sql` to add the notification flag and endpoint permission.
Apply `database/migrations/20260907_add_organization_wallet_address.sql` before using wallet-backed organization submission.
Apply `database/migrations/20260907_add_admin_organization_review.sql` to add administrator review, the one-time rejection revision workflow, and remove document-level verification status.
Apply `database/migrations/20260907_add_admin_organization_document_access.sql` to grant the administrator preview/download permission.
Apply `database/migrations/20260907_add_organization_resubmitted_status.sql` to distinguish revised submissions from initial submissions.
Apply `database/migrations/20260908_add_organization_identity_contract_result.sql` before enabling on-chain organization approval. Configure the Sepolia RPC, identity factory, and a newly rotated deployer key using `.env.example`; never reuse or commit an exposed private key.
Apply `database/migrations/20260908_add_token_creation_flow.sql`, then rerun `npm run seed:locations`, before using token creation. This adds ISO 3166-1 numeric codes, token/claim/restriction tables, claim values 1 and 2, menu data, and issuer permissions.
If that migration was applied before `maxBalancePerInvestor` changed from a percentage to an absolute token amount, also apply `database/migrations/20260908_change_token_max_balance_to_amount.sql`.
Apply `database/migrations/20260908_add_token_deployment_receipt.sql` before accepting frontend TREX deployment transaction hashes. Configure `TREX_FACTORY_ADDRESS` to the Sepolia factory that emits `TREXSuiteDeployed`.
Apply the dated migrations through `database/migrations/20260909_investor_claim_retry_permission.sql` for investor onboarding, investments, issuer claim signing, claim submission, and Retry permissions.
Apply `database/migrations/20260909_add_hybrid_claim_indexer.sql` to add the global claim checkpoint, durable event ledger, synchronization cursors, and worker settings. Set `CLAIM_INDEXER_START_BLOCK` to the earliest investor-claim block before starting production workers.
Apply `database/migrations/20260909_add_identity_registry_registration.sql` for the issuer Add to Registry flow, RBAC permissions, event ledger, and worker settings. Set `REGISTRY_INDEXER_START_BLOCK` to the earliest relevant Identity Registry deployment block in production. See `docs/IDENTITY-REGISTRY-REGISTRATION.md`.
Apply `database/migrations/20260909_add_registered_investment_status.sql` so verified registry confirmation atomically advances investment interests to `registered` and records their history event.
Apply `database/migrations/20260910_add_unique_investor_wallet.sql` to prevent the same normalized wallet address from being registered to multiple submitted investor profiles.
Apply `database/migrations/20260910_add_token_purchase_flow.sql` for backend-authoritative USDT payment intents, platform Token Agent minting, transaction audit history, RBAC, and hybrid payment/mint recovery. Configure `PURCHASE_USDT_ADDRESS` per network and `PURCHASE_PAYMENT_CONFIRMATIONS` for the synchronous confirm-and-mint path. See `docs/TOKEN-PURCHASE-FLOW.md`.
Apply `database/migrations/20260910_expire_abandoned_token_purchases.sql` to expire abandoned no-hash payment intents after their configurable deadline. The worker waits for the global USDT indexer to catch up before expiring them.

Apply `database/migrations/20260910_add_investor_token_purchase_history.sql` for the investor-owned token purchase history endpoint. Frontend integration is documented in `docs/FRONTEND-TOKEN-PURCHASE-FLOW-GUIDE.md`.

Apply `database/migrations/20260910_add_token_redemption_flow.sql` for investor-authorized manual redemption, issuer USDT payout verification, platform token lock/burn/unlock settlement, RBAC, audit history, and hybrid fallback recovery. Configure `REDEMPTION_USDT_ADDRESS`, use the standardized two-block confirmation threshold, and set the indexer start block. See `docs/TOKEN-REDEMPTION-FLOW.md` and `docs/FRONTEND-TOKEN-REDEMPTION-GUIDE.md`.

Apply `database/migrations/20260910_add_investor_invitations.sql` for issuer discovery of completed investor profiles, unique token invitations, durable email-delivery state, and the investor invitation inbox. Invitation links use `FRONTEND_URL/app/marketplace/{tokenUid}`. See `docs/INVESTOR-INVITATIONS.md`.

Apply `database/migrations/20260910_add_investor_portfolio_permission.sql` to grant investors access to the aggregated completed-investment portfolio endpoint.
Apply `database/migrations/20260911_add_token_transfer_flow.sql` for backend-authoritative investor token sends, exact transaction verification, sent/received history, RBAC, expiry, and hybrid global/targeted fallback recovery. Configure the transfer confirmation, indexer start block, TTL, and worker values from `.env.example`. See `docs/TOKEN-TRANSFER-FLOW.md`.

Apply `database/migrations/20260911_add_current_token_price.sql` to initialize `currentTokenPrice`
from the immutable launch price, add the owner-only price update permission, and snapshot the
effective price on token transfers. New purchase and redemption intents calculate against this
current price; existing intent snapshots are not repriced.

For a database exported from case-insensitive Windows MySQL and imported into case-sensitive Linux
MySQL, run `database/fix-linux-table-name-case.sql` after selecting the hosted database. It renames
all 48 tables to the exact camelCase identifiers used by runtime queries. See
`docs/DATABASE-TABLE-CASE-GUIDE.md` before running it.
Apply `database/migrations/20260911_set_blockchain_confirmations_to_two.sql` to standardize all existing database-backed deployment, claim, registry, purchase, redemption, and transfer worker confirmation settings at two blocks.

Apply `database/migrations/20260911_add_canonical_blockchain_transactions.sql` before deploying
the frontend-wallet transaction architecture. It adds role-scoped canonical history, strict fast
transaction confirmation, global checkpointed fallback indexing, reorg metadata, and disables the
legacy purchase/transfer orchestration plus redemption settlement permissions. Configure
`TRANSACTION_INDEXER_START_BLOCK` to the earliest controller/token activity that must be backfilled.
For an environment where the application code was deployed before this migration, also run
`database/migrations/20260911_repair_blockchain_transaction_permissions.sql`; it safely restores
missing or inactive transaction API grants and can be rerun.
See `docs/BLOCKCHAIN-TRANSACTION-INDEXER.md` and
`docs/FRONTEND-BLOCKCHAIN-TRANSACTION-GUIDE.md`. The complete status ownership, API order,
frontend polling rules, and indexer recovery behavior are documented in
`docs/BLOCKCHAIN-TRANSACTION-STATUS-AND-API-FLOW.md`.

```bash
npm run check
npm test
npm start
```

See [API documentation](docs/API.md), [transaction status and API flow](docs/BLOCKCHAIN-TRANSACTION-STATUS-AND-API-FLOW.md), [frontend wallet transaction guide](docs/FRONTEND-BLOCKCHAIN-TRANSACTION-GUIDE.md), [canonical transaction indexer](docs/BLOCKCHAIN-TRANSACTION-INDEXER.md), [investor claim flow](docs/INVESTOR-CLAIM-SUBMISSION.md), [frontend claim Retry guide](docs/FRONTEND-INVESTOR-CLAIM-RETRY-GUIDE.md), [global claim indexer](docs/CLAIM-INDEXER.md), [targeted claim recovery](docs/CLAIM-RECOVERY-RUNNER.md), [frontend organization guide](docs/FRONTEND-ORGANIZATION-GUIDE.md), [frontend token guide](docs/FRONTEND-TOKEN-CREATION-GUIDE.md), [investor invitations](docs/INVESTOR-INVITATIONS.md), [testing guide](docs/TESTING.md), [OpenAPI specification](docs/openapi.yaml), [editable database diagram](docs/trex-capital-market-database.excalidraw), and the import-ready [Postman collection](postman/Trex%20Capital%20Market%20Backend.postman_collection.json).

## Response contract

Successful responses contain `success`, `message`, `data`, `timestamp`, and `requestId`; paginated responses also contain `meta.pagination`. Errors contain `success: false` and an `error` object with a stable code and optional field details.

## Production notes

- Run behind TLS and set `TRUST_PROXY=true` only behind a trusted single proxy.
- Keep `.env` out of source control. Rotate JWT/SMTP/database secrets through a secret manager.
- Use migrations in deployment after the initial schema. Back up MySQL and ship logs to centralized storage.
- Set `ALLOWED_ORIGINS` to exact HTTPS frontend origins. There is no wildcard fallback.
- Configure `UPLOAD_DIR`, `UPLOAD_MAX_FILE_SIZE_MB`, and `UPLOAD_MAX_FILES`; store production uploads on encrypted persistent storage and include them in backup/retention procedures.
- Configure token-image storage and a ClamAV executable using the `TOKEN_IMAGE_*` variables when malware scanning is required in production.
- Monitor `blockchainIndexerCheckpoint` lag/errors and keep claim, registry, purchase, and redemption workers enabled. Indexers and platform-wallet execution use DB leases, so multiple API instances are safe.
- RBAC changes take effect on the next request. Role changes invalidate existing JWTs immediately.
