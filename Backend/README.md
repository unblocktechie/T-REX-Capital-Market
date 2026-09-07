# T-REX Capital Market Backend

A production-oriented Node.js, Express, and MySQL API foundation for T-REX Capital Market. It is a fresh implementation organized into controllers, services, repositories, schemas, middleware, dependency composition, and shared infrastructure.

## Features

- Issuer/investor signup role selection, email verification, verified-user login, forgot/reset password, and JWT authentication
- API-level role-based access control loaded from `permissionMaster`
- CRUD APIs for users, roles, menus, permissions, and general settings
- Issuer-only organization onboarding with company, jurisdiction, beneficial-owner, document, draft, and final-submission steps
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

```bash
npm run check
npm test
npm start
```

See [API documentation](docs/API.md), [frontend organization guide](docs/FRONTEND-ORGANIZATION-GUIDE.md), [testing guide](docs/TESTING.md), [OpenAPI specification](docs/openapi.yaml), [editable database diagram](docs/trex-capital-market-database.excalidraw), and the import-ready [Postman collection](postman/Trex%20Capital%20Market%20Backend.postman_collection.json).

## Response contract

Successful responses contain `success`, `message`, `data`, `timestamp`, and `requestId`; paginated responses also contain `meta.pagination`. Errors contain `success: false` and an `error` object with a stable code and optional field details.

## Production notes

- Run behind TLS and set `TRUST_PROXY=true` only behind a trusted single proxy.
- Keep `.env` out of source control. Rotate JWT/SMTP/database secrets through a secret manager.
- Use migrations in deployment after the initial schema. Back up MySQL and ship logs to centralized storage.
- Set `ALLOWED_ORIGINS` to exact HTTPS frontend origins. There is no wildcard fallback.
- Configure `UPLOAD_DIR`, `UPLOAD_MAX_FILE_SIZE_MB`, and `UPLOAD_MAX_FILES`; store production uploads on encrypted persistent storage and include them in backup/retention procedures.
- RBAC changes take effect on the next request. Role changes invalidate existing JWTs immediately.
