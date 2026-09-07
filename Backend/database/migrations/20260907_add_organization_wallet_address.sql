-- Apply once to an existing T-REX Capital Market database.
-- Fresh installations receive the same column from database/trex-capital-market.sql.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `organizationMaster`
  ADD COLUMN `walletAddress` VARCHAR(42) NULL AFTER `website`;
