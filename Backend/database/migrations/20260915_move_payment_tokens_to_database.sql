-- Moves the supported payment-token catalogue from application configuration to MySQL.
-- Existing token selections and transaction history remain unchanged.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `paymentTokenMaster` (
  `paymentTokenUid` CHAR(36) NOT NULL,
  `paymentTokenCode` VARCHAR(50) NOT NULL,
  `paymentTokenName` VARCHAR(80) NOT NULL,
  `paymentTokenSymbol` VARCHAR(20) NOT NULL,
  `contractAddress` VARCHAR(42) NOT NULL,
  `decimals` TINYINT UNSIGNED NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `networkName` VARCHAR(80) NOT NULL,
  `explorerUrl` VARCHAR(500) NULL,
  `supportsPurchase` BOOLEAN NOT NULL DEFAULT TRUE,
  `supportsRedemption` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDefault` BOOLEAN NOT NULL DEFAULT FALSE,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`paymentTokenUid`),
  UNIQUE KEY `ukPaymentTokenCode` (`paymentTokenCode`),
  UNIQUE KEY `ukPaymentTokenChainAddress` (`chainId`, `contractAddress`),
  KEY `idxPaymentTokenActive` (`chainId`, `isActive`, `isDeleted`, `displayOrder`),
  KEY `idxPaymentTokenActions` (`chainId`, `supportsPurchase`, `supportsRedemption`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

INSERT INTO `paymentTokenMaster`
  (`paymentTokenUid`, `paymentTokenCode`, `paymentTokenName`, `paymentTokenSymbol`,
   `contractAddress`, `decimals`, `chainId`, `networkName`, `explorerUrl`,
   `supportsPurchase`, `supportsRedemption`, `isDefault`, `displayOrder`)
VALUES
  ('70000000-0000-4000-8000-000000000001', 'SEPOLIA_USDT', 'USDT', 'USDT',
   '0x86B14D29A59b745bF08c42661322d13142d5eb49', 6, 11155111, 'Sepolia',
   'https://sepolia.etherscan.io/token/0x86B14D29A59b745bF08c42661322d13142d5eb49',
   TRUE, TRUE, TRUE, 10),
  ('70000000-0000-4000-8000-000000000002', 'SEPOLIA_USDC', 'USDC', 'USDC',
   '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 6, 11155111, 'Sepolia',
   'https://sepolia.etherscan.io/token/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
   TRUE, TRUE, FALSE, 20)
ON DUPLICATE KEY UPDATE
  `paymentTokenName` = VALUES(`paymentTokenName`),
  `paymentTokenSymbol` = VALUES(`paymentTokenSymbol`),
  `contractAddress` = VALUES(`contractAddress`),
  `decimals` = VALUES(`decimals`),
  `chainId` = VALUES(`chainId`),
  `networkName` = VALUES(`networkName`),
  `explorerUrl` = VALUES(`explorerUrl`),
  `supportsPurchase` = VALUES(`supportsPurchase`),
  `supportsRedemption` = VALUES(`supportsRedemption`),
  `isDefault` = VALUES(`isDefault`),
  `displayOrder` = VALUES(`displayOrder`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;
