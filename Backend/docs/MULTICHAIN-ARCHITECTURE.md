# Multichain Backend Architecture

## Source of truth

`chainMaster` is the runtime source of truth for chain ID, RPCs, contract addresses, confirmation thresholds, scan start blocks, and indexer enablement. `CHAIN_SECRET_ENCRYPTION_KEY` remains outside the database and encrypts each chain signer with AES-256-GCM. The API never returns the encrypted or decrypted signer.

`paymentTokenMaster.chainUid` and `tokenMaster.chainUid` bind business records to a chain. Historical blockchain records also store `chainUid` plus the immutable on-chain `chainId`, block number, block hash, transaction hash, and log index.

## Per-chain identities

`userChainIdentity` has one row per `userUid + chainUid`. A database uniqueness constraint prevents duplicate creation. Statuses are:

- `CREATING`: one caller owns the creation reservation;
- `CREATED`: the Identity Factory returned a non-zero ONCHAINID and the chain is unlocked;
- `FAILED`: the last attempt failed safely and may be retried.

The first identity is created during onboarding. Additional networks use `POST /api/v1/chains/:chainUid/unlock`.

For creation, the backend signer submits `createIdentity(wallet, salt)` to the selected chain's
`idFactoryAccessManagerAddress`. The manager enforces authorization and delegates to Identity
Factory. The backend continues to read `getIdentity(wallet)` from `identityFactoryAddress`
before and after submission. Both calls reuse the existing Factory ABI.

New chain creation requires an IDFactoryAccessManager address. A migrated chain without one can
remain available for reads and indexing, but ONCHAINID creation is unavailable until its real
Access Manager deployment address is configured.

If a chain's Identity Factory is redeployed, identities created by the retired factory are no
longer considered unlocked for the new deployment. The deployment migration marks those rows
`FAILED` with `IDENTITY_FACTORY_REDEPLOYED`; the user must call the unlock endpoint again. The
unlock service also detects a stored/configured factory mismatch defensively, clears stale
transaction evidence, creates or recovers the identity from the current factory, and refreshes
the legacy onboarding identity pointer when the selected chain is the profile's onboarding chain.

## Background jobs

The runner facade loads every active chain and executes each indexer sequentially to avoid RPC bursts. A failure on one network is logged and does not stop the next network. Disabled chains are skipped.

The following jobs are constructed with chain-specific runtime configuration:

- TREX deployment synchronization;
- claim recovery;
- ClaimAdded/ClaimChanged indexing;
- Identity Registry reconciliation;
- canonical INVEST/TRANSFER/REDEMPTION transaction indexing.

Canonical indexer checkpoints use `indexerName + chainId`. TREX deployment checkpoints use `TrexDeploymentLastSyncBlock.<chainId>`. Checkpoints advance only after a range is processed successfully.

## Investor-selected chain

Authenticated Investor calls under `/investors`, `/investments`, and `/investor/claims` require
the `X-Chain-Uid` header. The middleware resolves an active chain, and downstream reads/writes
scope tokens, portfolios, interests, invitations, claims, purchases, transfers, redemptions,
and canonical transaction history to it. Transaction confirmation rejects a body `chainId`
that differs from the selected header. This prevents a stale default network from being used
after a wallet or UI chain switch.

## Deployment order

1. Back up the database.
2. Configure a stable `CHAIN_SECRET_ENCRYPTION_KEY` of at least 32 random characters on every API/worker instance.
3. Apply `database/migrations/20260916_add_multichain_architecture.sql`.
4. For the migrated legacy chain only, keep the old signer available temporarily and run `npm run chain:bootstrap` once.
5. Verify `chainMaster.deployerPrivateKeyEncrypted IS NOT NULL`; never print its value.
6. After bootstrap and runtime verification, remove the legacy signer and chain settings from the environment; keep only `CHAIN_SECRET_ENCRYPTION_KEY`.
7. Restart all API/worker processes so they load chain configurations from the database.
8. Verify `GET /api/v1/chains`, `GET /api/v1/payment-tokens?chainUid=...`, and chain-specific worker logs.

New chains must be created through the admin API so address/private-key/RPC validations are applied consistently.

## Operational rules

- Never change `chainId` after tokens, payment tokens, or identities use a chain.
- Never rotate `CHAIN_SECRET_ENCRYPTION_KEY` without decrypting/re-encrypting all signer values in a controlled maintenance operation.
- Disabling a chain stops it from public selection and background indexing; it does not delete history.
- Contract and payment-token addresses are unique within a chain, not globally.
- Public payment tokens must exist in the database and in the selected Platform Controller's current on-chain allowlist.
- Existing tokens preserve their stored controller/agent; the selected chain configuration applies to newly created tokens.
- Network configuration is immutable after creation except for public RPC URL, explorer URL, fallback internal RPC URLs, active state, and image. Networks are disabled rather than deleted.
- `chainMasterAudit` stores append-only before/after snapshots for API-created network changes; encrypted signer material is represented only by a presence flag.
- Contract-suite redeployments are applied through a reviewed migration and a versioned manifest under `deployments/`; the migration must update scan boundaries, rewind only that chain's checkpoints, reassign undeployed drafts, and invalidate identities belonging to a retired factory.

## ARC Testnet deployment

The active 2026-09-21 ARC Testnet suite is recorded in `deployments/arcTestnet.json` and applied
by `database/migrations/20260921_update_arc_testnet_deployment.sql`. Its runtime addresses are:

- Identity Factory: `0x1182639700b0d7453Fe2fEd5EEE700ca4D9D944b`
- IDFactoryAccessManager: `0x6Eb7C431158c95ac0127CCF307B10050E2F12413`
- IDFactoryAccessManager Admin: `0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859`
- TREX Factory: `0xDcB5B1f7ABdF3aDF76b8C00BdA325cf5801eDdB5`
- Platform Controller: `0xE075cbA97869cdc1273d69dDBc0870C131bf902c`
- USDC payment token: `0x3600000000000000000000000000000000000000`
