-- Background TREX deployment sync (MySQL 8+)
-- Seeds the configurable settings the fallback reconciler reads from `generalSettings`,
-- and adds a nullable `deploymentSalt` column to `tokenMaster` so a recovered deployment
-- can persist the on-chain salt (indexed event topic hash). Idempotent, read-safe, and it
-- never modifies existing deployed-token records.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

-- Add tokenMaster.deploymentSalt only if it does not already exist (idempotent).
SET @hasDeploymentSalt := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenMaster' AND COLUMN_NAME = 'deploymentSalt'
);
SET @addDeploymentSalt := IF(
  @hasDeploymentSalt = 0,
  'ALTER TABLE `tokenMaster` ADD COLUMN `deploymentSalt` VARCHAR(66) NULL AFTER `deployTxHash`',
  'SELECT 1'
);
PREPARE stmt FROM @addDeploymentSalt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Configurable runner settings (group: trexDeploymentSync, non-public).
INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000a1', 'TrexDeploymentSyncInterval', '60', 'number', 'trexDeploymentSync',
    'Background TREX deployment sync interval in minutes.', FALSE),
  ('20000000-0000-4000-8000-0000000000a2', 'TrexDeploymentLastSyncBlock', '0', 'number', 'trexDeploymentSync',
    'Last blockchain block number successfully processed by the sync runner (checkpoint).', FALSE),
  ('20000000-0000-4000-8000-0000000000a3', 'TrexDeploymentBlockOffset', '500', 'number', 'trexDeploymentSync',
    'Number of blocks scanned per eth_getLogs request.', FALSE),
  ('20000000-0000-4000-8000-0000000000a4', 'TrexDeploymentConfirmationBlocks', '2', 'number', 'trexDeploymentSync',
    'Confirmation buffer; the runner never processes newer than LatestBlock - this value.', FALSE),
  ('20000000-0000-4000-8000-0000000000a5', 'TrexDeploymentStartBlock', '0', 'number', 'trexDeploymentSync',
    'Optional first-run start block (set to the TREX factory deploy block for full recovery). 0 = start one offset behind the safe head.', FALSE),
  ('20000000-0000-4000-8000-0000000000a6', 'TrexDeploymentSyncEnabled', 'true', 'boolean', 'trexDeploymentSync',
    'Master on/off switch for the background TREX deployment sync runner.', FALSE)
ON DUPLICATE KEY UPDATE
  `valueType` = VALUES(`valueType`),
  `settingGroup` = VALUES(`settingGroup`),
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;
-- Note: settingValue is intentionally NOT overwritten on re-run so operator-tuned values
-- and the live checkpoint (TrexDeploymentLastSyncBlock) are preserved.

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `generalSettings` WHERE `settingGroup` = 'trexDeploymentSync';
-- ALTER TABLE `tokenMaster` DROP COLUMN `deploymentSalt`;
