# Token duplicate-deployment protection

The frontend now treats the backend as the source of truth before opening the issuer wallet.

## Frontend safeguards

- Token Information maps backend uniqueness conflicts to the Token Name and Token Symbol fields.
- HTTP `409` conflicts on Token Information show a clear duplicate-token toast instead of a raw backend error.
- Immediately before `deployTREXSuite`, the frontend refreshes `/tokens/me` and blocks the wallet request when a deployment record, token contract address, deployment timestamp, or transaction record already exists.
- Duplicate Factory/Create2 errors are converted into a safe message that asks the issuer to use a unique name and symbol.
- A duplicate response from `POST /tokens/deploy` is handled idempotently: the frontend reloads the Token record and accepts it only when its transaction hash or token address matches the confirmed deployment.
- Full technical errors are still written to the developer console, while users receive a short actionable toast.

## Required backend enforcement

Frontend checks improve safety but cannot enforce uniqueness across users or devices. The backend should enforce normalized unique constraints for the intended scope, normally:

- token symbol;
- token name, when product rules require it;
- deployed token contract address;
- deployment transaction hash;
- one confirmed deployment per Token UID.

Recommended duplicate response:

```json
{
  "code": "TOKEN_ALREADY_EXISTS",
  "message": "A token with this name or symbol already exists.",
  "errors": {
    "tokenName": ["This token name is already in use."],
    "tokenSymbol": ["This token symbol is already in use."]
  }
}
```

Return HTTP `409 Conflict`. The frontend also recognizes common database uniqueness codes such as PostgreSQL `23505`, Prisma `P2002`, MySQL `ER_DUP_ENTRY`, and Sequelize unique-constraint errors.
