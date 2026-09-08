-- Apply once if 20260908_add_token_creation_flow.sql was already executed.
-- maxBalancePerInvestor is an absolute token amount, not a percentage.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenMaster`
  MODIFY COLUMN `maxBalancePerInvestor` DECIMAL(36,18) NULL;
