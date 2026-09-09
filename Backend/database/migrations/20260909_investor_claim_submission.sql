-- Investor on-chain claim submission + verification (MySQL 8+).
-- The investor submits each issuer-signed claim on-chain (to their ONCHAINID) and sends the
-- txHash + claim id to the backend. The backend independently verifies, via the transaction
-- receipt, that the exact expected claim (topic + issuer + data + signature) was added to the
-- expected investor identity contract, then records a CONFIRMED submission. When every required
-- claim is CONFIRMED the interest advances verifiedByIssuer -> claimSubmitted.
-- camelCase names (no underscores), no foreign keys, UTC. Idempotent. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `investorClaimSubmission` (
  `submissionUid` CHAR(36) NOT NULL,
  -- The subscription: our token investment interest.
  `interestUid` CHAR(36) NOT NULL,
  -- The issuer-signed claim being submitted (issuerClaimSignature.signatureUid).
  `claimSignatureUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `claimTopic` INT NOT NULL,
  `data` TEXT NULL,
  `signature` TEXT NULL,
  `investorIdentityAddress` VARCHAR(42) NULL,
  `issuerIdentityAddress` VARCHAR(42) NULL,
  `txHash` VARCHAR(66) NULL,
  `blockNumber` BIGINT NULL,
  `transactionIndex` INT NULL,
  `logIndex` INT NULL,
  `status` ENUM('PENDING', 'CONFIRMED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `failureReason` VARCHAR(255) NULL,
  `submittedAt` DATETIME(3) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`submissionUid`),
  -- One submission record per claim per application (idempotent upsert target).
  UNIQUE KEY `ukInvestorClaimSubmission` (`interestUid`, `claimSignatureUid`),
  -- The verified on-chain event can be recorded only once (NULLs allowed until confirmed).
  UNIQUE KEY `ukInvestorClaimSubmissionEvent` (`txHash`, `logIndex`),
  KEY `idxInvestorClaimSubmissionInterest` (`interestUid`, `status`, `isDeleted`),
  KEY `idxInvestorClaimSubmissionInvestor` (`investorUid`, `isDeleted`)
) ENGINE=InnoDB;

-- Interest status gains 'claimSubmitted' (reached when all required claims are CONFIRMED).
ALTER TABLE `tokenInvestmentInterest`
  MODIFY COLUMN `status`
    ENUM('pending', 'submitIntrest', 'verifiedByIssuer', 'claimSubmitted', 'approved', 'rejected', 'cancelled')
    NOT NULL DEFAULT 'pending';

-- Timeline event for the verifiedByIssuer -> claimSubmitted transition.
ALTER TABLE `tokenInvestmentInterestHistory`
  MODIFY COLUMN `eventType`
    ENUM('submitted', 'rejected', 'resubmitted', 'approved', 'verifiedByIssuer', 'claimSubmitted') NOT NULL;

-- Investor permissions (menu 10000000-0000-4000-8000-000000000009, investor role 004).
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'List issuer-signed claims to submit', 'INVESTOR_CLAIM_LIST', 'GET', '/api/v1/investor/claims'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Submit an on-chain investor claim', 'INVESTOR_CLAIM_SUBMIT', 'POST', '/api/v1/investor/claims/:claimId/submit')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN ('INVESTOR_CLAIM_LIST','INVESTOR_CLAIM_SUBMIT');
-- DROP TABLE IF EXISTS `investorClaimSubmission`;
-- ALTER TABLE `tokenInvestmentInterestHistory` MODIFY COLUMN `eventType`
--   ENUM('submitted','rejected','resubmitted','approved','verifiedByIssuer') NOT NULL;
-- ALTER TABLE `tokenInvestmentInterest` MODIFY COLUMN `status`
--   ENUM('pending','submitIntrest','verifiedByIssuer','approved','rejected','cancelled') NOT NULL DEFAULT 'pending';
