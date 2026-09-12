-- T-REX Capital Market V2 / Privy migration
-- Target: MySQL 8+
-- Scope: add the Privy identity + embedded EVM wallet binding to userMaster.
-- Existing organizationMaster/investorMaster.walletAddress columns are intentionally retained:
-- V2 backend code copies the verified userMaster.privyWalletAddress into those columns on submit,
-- so existing downstream/on-chain ownership checks continue to work without a full schema rewrite.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

START TRANSACTION;

ALTER TABLE `userMaster`
  ADD COLUMN `privyUserId` varchar(128) DEFAULT NULL AFTER `emailVerifiedAt`,
  ADD COLUMN `privyWalletId` varchar(128) DEFAULT NULL AFTER `privyUserId`,
  ADD COLUMN `privyWalletAddress` varchar(42) DEFAULT NULL AFTER `privyWalletId`,
  ADD COLUMN `privyLinkedAt` datetime(3) DEFAULT NULL AFTER `privyWalletAddress`,
  ADD UNIQUE KEY `ukUserMasterPrivyUserId` (`privyUserId`),
  ADD UNIQUE KEY `ukUserMasterPrivyWalletAddress` (`privyWalletAddress`);

-- Disable any still-live legacy application email-verification links.
-- V2 uses Privy's email OTP and no longer creates/consumes emailVerification authToken rows.
UPDATE `authToken`
SET
  `revokedAt` = COALESCE(`revokedAt`, UTC_TIMESTAMP(3)),
  `isActive` = 0,
  `updatedAt` = UTC_TIMESTAMP(3)
WHERE `tokenType` = 'emailVerification'
  AND `usedAt` IS NULL
  AND `revokedAt` IS NULL
  AND `isDeleted` = 0;

COMMIT;

-- IMPORTANT EXISTING-DATA NOTE:
-- Do not automatically copy legacy organizationMaster/investorMaster walletAddress values into
-- userMaster.privyWalletAddress. Those addresses may be MetaMask/external EOAs and are not proof
-- of a Privy identity. Existing users should bind a verified Privy identity through the V2 login
-- flow. Existing already-submitted on-chain identities should be migrated only with an explicit
-- operational wallet/identity migration procedure, not by this schema migration.
