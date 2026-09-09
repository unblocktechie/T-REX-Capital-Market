-- Add 'verifiedByIssuer' to the investment interest status enum (MySQL 8+).
-- The issuer's positive review now sets the interest to 'verifiedByIssuer' (the state in which
-- issuer claim signing is allowed). 'approved' is kept in the enum, reserved for a future step.
-- MODIFY is idempotent. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenInvestmentInterest`
  MODIFY COLUMN `status`
    ENUM('pending', 'submitIntrest', 'verifiedByIssuer', 'approved', 'rejected', 'cancelled')
    NOT NULL DEFAULT 'pending';

-- ---------------------------------------------------------------------------
-- Rollback (manual; only if no rows use 'verifiedByIssuer'):
-- ALTER TABLE `tokenInvestmentInterest`
--   MODIFY COLUMN `status`
--     ENUM('pending','submitIntrest','approved','rejected','cancelled') NOT NULL DEFAULT 'pending';
