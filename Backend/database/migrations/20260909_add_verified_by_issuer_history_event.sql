-- Add 'verifiedByIssuer' to the interest timeline event types (MySQL 8+).
-- When issuer claim signing fully verifies a subscription (overall SIGNED), a 'verifiedByIssuer'
-- event is written to the timeline so the status change is visible in the history.
-- MODIFY is idempotent. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenInvestmentInterestHistory`
  MODIFY COLUMN `eventType`
    ENUM('submitted', 'rejected', 'resubmitted', 'approved', 'verifiedByIssuer') NOT NULL;

-- ---------------------------------------------------------------------------
-- Rollback (manual; only if no rows use 'verifiedByIssuer'):
-- ALTER TABLE `tokenInvestmentInterestHistory`
--   MODIFY COLUMN `eventType` ENUM('submitted','rejected','resubmitted','approved') NOT NULL;
