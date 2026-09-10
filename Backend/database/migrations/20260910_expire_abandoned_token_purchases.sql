-- Expire abandoned token-purchase intents that never received a frontend payment hash.
-- The worker applies this only after the global USDT indexer reaches the safe chain head.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenPurchase`
  MODIFY COLUMN `status`
    ENUM('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED','COMPLETED','EXPIRED')
    NOT NULL DEFAULT 'PENDING_PAYMENT',
  ADD COLUMN `expiresAt` DATETIME(3) NULL AFTER `activeInvestorUid`,
  ADD COLUMN `expiredAt` DATETIME(3) NULL AFTER `expiresAt`,
  ADD COLUMN `expirationReason` VARCHAR(100) NULL AFTER `expiredAt`;

-- Give existing rows the same 15-minute lifetime used by the default application setting.
-- Rows with a payment hash are never auto-expired, regardless of this timestamp.
UPDATE `tokenPurchase`
SET `expiresAt` = DATE_ADD(`createdAt`, INTERVAL 15 MINUTE)
WHERE `expiresAt` IS NULL;

ALTER TABLE `tokenPurchase`
  MODIFY COLUMN `expiresAt` DATETIME(3) NOT NULL,
  MODIFY COLUMN `activeInterestUid` CHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `status` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')
        THEN `interestUid` ELSE NULL END
    ) STORED,
  MODIFY COLUMN `activeInvestorUid` CHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `status` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')
        THEN `investorUid` ELSE NULL END
    ) STORED,
  ADD KEY `idxTokenPurchaseExpiration` (`status`,`paymentTxHash`,`expiresAt`,`isDeleted`);

INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000e9','PurchaseExpirationBatchSize','50','number','purchaseWorker','Abandoned no-hash payment intents expired per worker run.',FALSE),
  ('20000000-0000-4000-8000-0000000000ea','PurchaseIntentExpiryGraceSeconds','180','number','purchaseWorker','Grace period after intent expiry so the safe-chain indexer can recover a submitted transfer.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;
