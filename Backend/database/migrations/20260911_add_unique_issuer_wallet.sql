-- One active organization assignment per normalized issuer wallet address.
-- Select the T-REX Capital Market database before running this one-time migration.
-- The ALTER intentionally fails if historical duplicates still exist.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

SELECT LOWER(TRIM(`walletAddress`)) AS `duplicateWalletAddress`, COUNT(*) AS `organizationCount`
FROM `organizationMaster`
WHERE `walletAddress` IS NOT NULL AND TRIM(`walletAddress`) <> '' AND `isDeleted` = 0
GROUP BY LOWER(TRIM(`walletAddress`))
HAVING COUNT(*) > 1;

ALTER TABLE `organizationMaster`
  ADD COLUMN `registeredWalletAddress` VARCHAR(42)
    GENERATED ALWAYS AS (
      CASE
        WHEN `walletAddress` IS NOT NULL AND TRIM(`walletAddress`) <> '' AND `isDeleted` = 0
          THEN LOWER(TRIM(`walletAddress`))
        ELSE NULL
      END
    ) STORED AFTER `walletAddress`,
  ADD UNIQUE KEY `ukOrganizationMasterRegisteredWallet` (`registeredWalletAddress`);

-- Verification:
-- SHOW INDEX FROM `organizationMaster` WHERE Key_name = 'ukOrganizationMasterRegisteredWallet';
