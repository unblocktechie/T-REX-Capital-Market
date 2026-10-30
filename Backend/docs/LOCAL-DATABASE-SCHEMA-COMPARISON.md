# Local database schema comparison

## Interpretation

- Latest has 59 tables versus 51 in the mainnet copy; 8 tables are new and none are removed.
- The only added column in shared tables is organizationmaster.serviceWalletAddress (nullable varchar(42)). No columns are removed.
- All shared-table indexes, foreign-key definitions, foreign-key actions, engines and table collations match.
- Latest adds JSON-validity checks on chainmaster (fallbackRpcUrls, delegationManagerAddresses), chainmasteraudit (beforeData, afterData, changedFields), tokendeploymentattempt (metadata), and tokenredemptionhistory (metadata). Existing invalid JSON must be checked before adding these constraints to a production database.
- Generated expressions on investormaster, organizationmaster, tokenpurchase, tokenredemption and tokentransfer differ only by explicit _utf8mb4 string-literal prefixes in the imported copy. These are not new business rules. Column-position shifts in organizationmaster result from inserting the new column.
- This comparison is against the local imported copy, not a connection to live production. Settings values, permissions and other record-level migration requirements are outside this schema report.
- Local MariaDB uses lower_case_table_names=1, so names appear lowercase; preserve the backend's canonical casing when deploying to case-sensitive Linux MySQL.

Latest: `trexCapitalMarket`; mainnet copy: `trexCapitalMarketMultichainTemp`.

Read-only comparison of schema metadata. No rows were modified. Application data, settings values, routines, triggers and views definitions are not compared.

Tables: latest **59**, mainnet copy **51**.

## Tables only in latest

- `issuerapikey`: `issuerApiKeyUid` (char(36)), `publicId` (char(24)), `userUid` (char(36)), `organizationUid` (char(36)), `keyName` (varchar(100)), `keyHash` (char(64)), `keyPrefix` (varchar(32)), `keyLastFour` (char(4)), `scopes` (longtext), `expiresAt` (datetime(3)), `lastUsedAt` (datetime(3)), `lastUsedIp` (varchar(64)), `revokedAt` (datetime(3)), `isActive` (tinyint(1)), `isDeleted` (tinyint(1)), `createdAt` (datetime(3)), `updatedAt` (datetime(3))
- `issuerapikeyaudit`: `issuerApiKeyAuditUid` (char(36)), `issuerApiKeyUid` (char(36)), `userUid` (char(36)), `action` (enum('CREATED','AUTHENTICATED','REVOKED','ROTATED','POLICY_UPDATED')), `httpMethod` (varchar(10)), `apiPath` (varchar(255)), `ipAddress` (varchar(64)), `userAgent` (varchar(500)), `requestId` (varchar(100)), `details` (longtext), `createdAt` (datetime(3))
- `issuerapikeypolicy`: `issuerApiKeyUid` (char(36)), `threshold` (decimal(5,2)), `maxCumulative24hPercent` (decimal(5,2)), `cooldownSeconds` (int(10) unsigned), `frequency` (enum('hourly','daily','weekly','monthly')), `allowedDays` (longtext), `startTime` (char(5)), `endTime` (char(5)), `timezone` (varchar(100)), `allowedIps` (longtext), `createdAt` (datetime(3)), `updatedAt` (datetime(3))
- `organizationservicewallet`: `organizationServiceWalletUid` (char(36)), `organizationUid` (char(36)), `chainUid` (char(36)), `chainId` (bigint(20) unsigned), `controllerAddress` (varchar(42)), `mainWalletAddress` (varchar(42)), `serviceWalletAddress` (varchar(42)), `sourceTxHash` (varchar(66)), `sourceBlockNumber` (bigint(20) unsigned), `sourceBlockHash` (varchar(66)), `sourceLogIndex` (int(10) unsigned), `verifiedAt` (datetime(3)), `isActive` (tinyint(1)), `isDeleted` (tinyint(1)), `createdAt` (datetime(3)), `updatedAt` (datetime(3))
- `tokenpriceapirequest`: `requestUid` (char(36)), `userUid` (char(36)), `createdAt` (datetime(3))
- `tokenpriceupdate`: `priceUpdateUid` (char(36)), `chainUid` (char(36)), `chainId` (bigint(20) unsigned), `tokenUid` (char(36)), `organizationUid` (char(36)), `issuerUserUid` (char(36)), `controllerAddress` (varchar(42)), `tokenAddress` (varchar(42)), `issuerWalletAddress` (varchar(42)), `serviceWalletAddress` (varchar(42)), `submissionMode` (enum('RELAYED','DIRECT','INDEXED','LEGACY')), `priceDecimals` (tinyint(3) unsigned), `oldPriceRaw` (varchar(78)), `newPriceRaw` (varchar(78)), `newPriceFormatted` (decimal(65,18)), `signerNonce` (varchar(78)), `signatureDeadline` (bigint(20) unsigned), `signatureV` (tinyint(3) unsigned), `signatureR` (varchar(66)), `signatureS` (varchar(66)), `status` (enum('PENDING','SUBMITTED','CONFIRMED','FAILED','ORPHANED','APPLIED','CANCELLED','EXPIRED')), `transactionHash` (varchar(66)), `blockNumber` (bigint(20) unsigned), `blockHash` (varchar(66)), `transactionIndex` (int(10) unsigned), `logIndex` (int(10) unsigned), `gasUsed` (varchar(78)), `effectiveGasPrice` (varchar(78)), `submittedAt` (datetime(3)), `confirmedAt` (datetime(3)), `errorCode` (varchar(100)), `errorMessage` (varchar(2000)), `isCanonical` (tinyint(1)), `isActive` (tinyint(1)), `isDeleted` (tinyint(1)), `createdAt` (datetime(3)), `updatedAt` (datetime(3)), `oldPriceFormatted` (decimal(65,18)), `isLegacyUpdate` (tinyint(1)), `isOnchainUpdate` (tinyint(1)), `directTransactionNonce` (bigint(20) unsigned), `preparedAtBlock` (bigint(20) unsigned), `updateType` (varchar(20))
- `tokenservicewallet`: `tokenServiceWalletUid` (char(36)), `tokenUid` (char(36)), `tokenAddress` (varchar(42)), `organizationUid` (char(36)), `chainUid` (char(36)), `chainId` (bigint(20) unsigned), `controllerAddress` (varchar(42)), `mainWalletAddress` (varchar(42)), `serviceWalletAddress` (varchar(42)), `sourceTxHash` (varchar(66)), `sourceBlockNumber` (bigint(20) unsigned), `sourceBlockHash` (varchar(66)), `sourceLogIndex` (int(10) unsigned), `verifiedAt` (datetime(3)), `isActive` (tinyint(1)), `isDeleted` (tinyint(1)), `createdAt` (datetime(3)), `updatedAt` (datetime(3))
- `verificationteamnotification`: `notificationUid` (char(36)), `userUid` (char(36)), `fullName` (varchar(255)), `email` (varchar(255)), `roleName` (varchar(40)), `status` (enum('PENDING','SENDING','SENT')), `attempts` (int(10) unsigned), `leaseToken` (char(36)), `leaseUntil` (datetime(3)), `nextAttemptAt` (datetime(3)), `lastError` (varchar(100)), `sentAt` (datetime(3)), `createdAt` (datetime(3))

## Tables only in mainnet copy

None.

## Changes in shared tables

### chainmaster


Changed table (mainnet copy → latest):
```json
"chainmaster"
```

Changed checks (mainnet copy → latest):
```json
{
  "liveCopy": [],
  "latest": [
    {
      "CONSTRAINT_NAME": "delegationManagerAddresses",
      "CHECK_CLAUSE": "json_valid(`delegationManagerAddresses`)"
    },
    {
      "CONSTRAINT_NAME": "fallbackRpcUrls",
      "CHECK_CLAUSE": "json_valid(`fallbackRpcUrls`)"
    }
  ]
}
```

### chainmasteraudit


Changed table (mainnet copy → latest):
```json
"chainmasteraudit"
```

Changed checks (mainnet copy → latest):
```json
{
  "liveCopy": [],
  "latest": [
    {
      "CONSTRAINT_NAME": "afterData",
      "CHECK_CLAUSE": "json_valid(`afterData`)"
    },
    {
      "CONSTRAINT_NAME": "beforeData",
      "CHECK_CLAUSE": "json_valid(`beforeData`)"
    },
    {
      "CONSTRAINT_NAME": "changedFields",
      "CHECK_CLAUSE": "json_valid(`changedFields`)"
    }
  ]
}
```

### investormaster

- Changed `registeredWalletAddress`: GENERATION_EXPRESSION: "case when `status` = _utf8mb4'submitted' and `walletAddress` is not null and trim(`walletAddress`) <> _utf8mb4'' then lcase(trim(`walletAddress`)) else NULL end" → "case when `status` = 'submitted' and `walletAddress` is not null and trim(`walletAddress`) <> '' then lcase(trim(`walletAddress`)) else NULL end".

Changed table (mainnet copy → latest):
```json
"investormaster"
```

### organizationmaster

- Added column `serviceWalletAddress`: `varchar(42)`, nullable=YES, default="NULL", extra=none.
- Changed `onboardingChainUid`: ORDINAL_POSITION: 18 → 19.
- Changed `registeredWalletAddress`: ORDINAL_POSITION: 19 → 20; GENERATION_EXPRESSION: "case when `walletAddress` is not null and trim(`walletAddress`) <> _utf8mb4'' and `isDeleted` = 0 then lcase(trim(`walletAddress`)) else NULL end" → "case when `walletAddress` is not null and trim(`walletAddress`) <> '' and `isDeleted` = 0 then lcase(trim(`walletAddress`)) else NULL end".
- Changed `contractAddress`: ORDINAL_POSITION: 20 → 21.
- Changed `contractTxnHash`: ORDINAL_POSITION: 21 → 22.
- Changed `contractTxnMessage`: ORDINAL_POSITION: 22 → 23.
- Changed `currentStep`: ORDINAL_POSITION: 23 → 24.
- Changed `isDraft`: ORDINAL_POSITION: 24 → 25.
- Changed `status`: ORDINAL_POSITION: 25 → 26.
- Changed `isUserNotified`: ORDINAL_POSITION: 26 → 27.
- Changed `submittedAt`: ORDINAL_POSITION: 27 → 28.
- Changed `isActive`: ORDINAL_POSITION: 28 → 29.
- Changed `isDeleted`: ORDINAL_POSITION: 29 → 30.
- Changed `createdAt`: ORDINAL_POSITION: 30 → 31.
- Changed `updatedAt`: ORDINAL_POSITION: 31 → 32.
- Changed `rejectionReason`: ORDINAL_POSITION: 32 → 33.
- Changed `rejectionCount`: ORDINAL_POSITION: 33 → 34.
- Changed `canResubmit`: ORDINAL_POSITION: 34 → 35.

Changed table (mainnet copy → latest):
```json
"organizationmaster"
```

### tokendeploymentattempt


Changed table (mainnet copy → latest):
```json
"tokendeploymentattempt"
```

Changed checks (mainnet copy → latest):
```json
{
  "liveCopy": [],
  "latest": [
    {
      "CONSTRAINT_NAME": "metadata",
      "CHECK_CLAUSE": "json_valid(`metadata`)"
    }
  ]
}
```

### tokenpurchase

- Changed `activeInterestUid`: GENERATION_EXPRESSION: "case when `status` in (_utf8mb4'PENDING_PAYMENT',_utf8mb4'PAYMENT_CONFIRMED',_utf8mb4'MINT_SUBMITTED') then `interestUid` else NULL end" → "case when `status` in ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') then `interestUid` else NULL end".
- Changed `activeInvestorUid`: GENERATION_EXPRESSION: "case when `status` in (_utf8mb4'PENDING_PAYMENT',_utf8mb4'PAYMENT_CONFIRMED',_utf8mb4'MINT_SUBMITTED') then `investorUid` else NULL end" → "case when `status` in ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') then `investorUid` else NULL end".

Changed table (mainnet copy → latest):
```json
"tokenpurchase"
```

### tokenredemption

- Changed `activeInterestUid`: GENERATION_EXPRESSION: "case when `status` not in (_utf8mb4'COMPLETED',_utf8mb4'ISSUER_REJECTED',_utf8mb4'CANCELLED',_utf8mb4'EXPIRED') then `interestUid` else NULL end" → "case when `status` not in ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED') then `interestUid` else NULL end".

Changed table (mainnet copy → latest):
```json
"tokenredemption"
```

### tokenredemptionhistory


Changed table (mainnet copy → latest):
```json
"tokenredemptionhistory"
```

Changed checks (mainnet copy → latest):
```json
{
  "liveCopy": [],
  "latest": [
    {
      "CONSTRAINT_NAME": "metadata",
      "CHECK_CLAUSE": "json_valid(`metadata`)"
    }
  ]
}
```

### tokentransfer

- Changed `activeSenderTokenKey`: GENERATION_EXPRESSION: "case when `status` = _utf8mb4'PENDING_TRANSFER' then concat(lcase(`senderWalletAddress`),_utf8mb4':',lcase(`tokenAddress`)) else NULL end" → "case when `status` = 'PENDING_TRANSFER' then concat(lcase(`senderWalletAddress`),':',lcase(`tokenAddress`)) else NULL end".

Changed table (mainnet copy → latest):
```json
"tokentransfer"
```
