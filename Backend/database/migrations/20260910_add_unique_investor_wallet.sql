-- Investor wallet ownership guard (MySQL 8+ / MariaDB 10.4+)
-- One submitted investor profile per normalized EVM wallet address.
-- Draft rows intentionally resolve to NULL and therefore do not reserve a wallet.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

SET @hasRegisteredWalletColumn := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'investormaster'
    AND COLUMN_NAME = 'registeredWalletAddress'
);
SET @sql := IF(
  @hasRegisteredWalletColumn = 0,
  'ALTER TABLE `investorMaster`
     ADD COLUMN `registeredWalletAddress` VARCHAR(42)
       GENERATED ALWAYS AS (
         CASE
           WHEN `status` = ''submitted'' AND `walletAddress` IS NOT NULL AND TRIM(`walletAddress`) <> ''''
             THEN LOWER(TRIM(`walletAddress`))
           ELSE NULL
         END
       ) STORED AFTER `walletAddress`',
  'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- Adding this index intentionally fails if historical submitted duplicates exist. That is
-- safer than silently deleting or merging investor identity records during a deployment.
SET @hasRegisteredWalletIndex := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'investormaster'
    AND INDEX_NAME = 'ukInvestorMasterRegisteredWallet'
);
SET @sql := IF(
  @hasRegisteredWalletIndex = 0,
  'ALTER TABLE `investorMaster`
     ADD UNIQUE KEY `ukInvestorMasterRegisteredWallet` (`registeredWalletAddress`)',
  'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- Verification:
-- SHOW INDEX FROM `investorMaster` WHERE Key_name = 'ukInvestorMasterRegisteredWallet';
