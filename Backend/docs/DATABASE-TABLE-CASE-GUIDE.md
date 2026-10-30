# Linux MySQL Table-Name Case Guide

The backend uses 51 camelCase table identifiers. Windows MySQL commonly runs with
`lower_case_table_names=1`, so incorrect lowercase names may work locally. Linux MySQL normally uses
`lower_case_table_names=0`, where `userMaster` and `usermaster` are different table names.

The audited local import currently reports every table in lowercase. The backend runtime uses these
exact names:

```text
authToken
blockchainIndexerCheckpoint
blockchainIndexedContract
blockchainTransaction
chainMaster
chainMasterAudit
cityMaster
claimTopicMaster
countryMaster
documentTypeMaster
entityTypeMaster
generalSettings
identityRegistryBlockchainEvent
identityRegistryRegistration
industryMaster
investmentSubmissionDocument
investorClaimBlockchainEvent
investorClaimSubmission
investorDocument
investorDocumentTypeMaster
investorInvestmentCategory
investorInvitation
investorMaster
issuerClaimSignature
issuerClaimVerification
menuMaster
organizationBeneficialOwner
organizationDocument
organizationMaster
paymentTokenMaster
permissionMaster
stateMaster
tokenClaimTopic
tokenCountryRestriction
tokenDeploymentAttempt
tokenInvestmentInterest
tokenInvestmentInterestHistory
tokenMaster
tokenPurchase
tokenPurchasePaymentEvent
tokenPurchaseTransaction
tokenRedemption
tokenRedemptionHistory
tokenRedemptionPaymentEvent
tokenRedemptionTransaction
tokenTransfer
tokenTransferBlockchainEvent
tokenTransferTransaction
userChainIdentity
userMaster
userRole
```

## Repair the imported Linux database

Back up the hosted database and stop the backend before changing table names.

```bash
mysqldump -u DB_USER -p --single-transaction DB_NAME > trex-before-table-case-fix.sql
mysql -u DB_USER -p -e "SELECT @@lower_case_table_names;"
mysql -u DB_USER -p DB_NAME < database/fix-linux-table-name-case.sql
```

The second command must return `0`. The repair script does not access `information_schema`; it
directly renames the 51 lowercase table names produced by the audited Windows export to the exact
camelCase names used by the backend.

Run the repair script only once. The renames are issued as a single statement, so MySQL fails the
operation instead of leaving a partially renamed schema if a source table is missing or a target
name already exists. Inspect the final `SHOW TABLES` output, then restart the backend and call:

```text
GET /api/health
GET /api/v1/investments/me/portfolio
```

## Recover a partially repaired database

If some tables have already been renamed but others remain lowercase, use the idempotent recovery
script with an administrative MySQL account:

```bash
mysql -u root -p DB_NAME < database/fix-linux-table-name-case-partial.sql
```

This variant reads `information_schema.TABLES`, leaves existing canonical camelCase names alone,
and renames every remaining lowercase table. It is intended for mixed schemas only; hosted users
without `information_schema` access should ask an administrator to run it.

## Important deployment rule

Do not solve this by changing `lower_case_table_names` on an initialized Linux MySQL data directory.
That server variable must be chosen before initialization and changing it later can make existing
tables inaccessible. Keeping schema identifiers exactly aligned with the application is the safer
portable fix.
