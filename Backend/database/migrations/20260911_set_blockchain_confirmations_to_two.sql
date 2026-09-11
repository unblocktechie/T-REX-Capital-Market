-- Standardize all blockchain worker confirmation thresholds at two blocks.
-- This migration is idempotent and updates existing installations whose original
-- feature migrations seeded a twelve-block confirmation buffer.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000a4', 'TrexDeploymentConfirmationBlocks', '2', 'number', 'trexDeploymentSync',
    'Confirmation buffer; the runner never processes newer than LatestBlock - this value.', FALSE),
  ('20000000-0000-4000-8000-0000000000b3', 'ClaimRecoveryConfirmationBlocks', '2', 'number', 'claimRecovery',
    'Safe-head confirmation buffer used while recovering claim events.', FALSE),
  ('20000000-0000-4000-8000-0000000000c5', 'ClaimIndexerConfirmationBlocks', '2', 'number', 'claimIndexer',
    'Safe-head confirmation buffer used by the global claim indexer.', FALSE),
  ('20000000-0000-4000-8000-0000000000d5', 'RegistryIndexerConfirmationBlocks', '2', 'number', 'registryIndexer',
    'Safe-head confirmation buffer for registry indexing.', FALSE),
  ('20000000-0000-4000-8000-0000000000e4', 'PurchaseIndexerConfirmationBlocks', '2', 'number', 'purchaseWorker',
    'Safe-head confirmation buffer for payments and mints.', FALSE),
  ('20000000-0000-4000-8000-0000000000f4', 'RedemptionConfirmationBlocks', '2', 'number', 'redemptionWorker',
    'Canonical confirmation threshold for lock, payment, burn, and unlock.', FALSE),
  ('21000000-0000-4000-8000-000000000004', 'TransferIndexerConfirmationBlocks', '2', 'number', 'transferWorker',
    'Safe-head confirmation buffer for recovered transfers.', FALSE)
ON DUPLICATE KEY UPDATE
  `settingValue` = '2',
  `valueType` = 'number',
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE,
  `updatedAt` = UTC_TIMESTAMP();
