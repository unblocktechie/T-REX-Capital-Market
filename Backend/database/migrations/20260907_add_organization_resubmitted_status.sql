-- Apply once to add the explicit status used after the issuer's allowed revision.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `organizationMaster`
  MODIFY COLUMN `status`
    ENUM('draft', 'submitted', 'resubmitted', 'underReview', 'approved', 'rejected')
    NOT NULL DEFAULT 'draft';
