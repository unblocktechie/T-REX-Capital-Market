-- Finalize a successful Identity Registry registration in the investment lifecycle.
-- Adds the registered status and its immutable timeline event. MySQL 8+, UTC, no foreign keys.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenInvestmentInterest`
  MODIFY COLUMN `status`
    ENUM('pending', 'submitIntrest', 'verifiedByIssuer', 'claimSubmitted', 'registered', 'approved', 'rejected', 'cancelled')
    NOT NULL DEFAULT 'pending';

ALTER TABLE `tokenInvestmentInterestHistory`
  MODIFY COLUMN `eventType`
    ENUM('submitted', 'rejected', 'resubmitted', 'approved', 'verifiedByIssuer', 'claimSubmitted', 'registered')
    NOT NULL;

-- Identity Registry confirmation now atomically performs:
-- identityRegistryRegistration.PENDING -> CONFIRMED
-- tokenInvestmentInterest.claimSubmitted -> registered
-- tokenInvestmentInterestHistory eventType = registered
