-- General Settings for the investor claim recovery fallback runner (MySQL 8+).
-- Mirrors the TREX deployment sync settings. Fixed settingUids keep re-runs idempotent; the
-- operator-tuned settingValue is intentionally NOT overwritten on re-run. Idempotent.
-- NOTE: there is deliberately NO ClaimRecoveryLastSyncBlock — claim recovery is DB-driven and
-- targeted per suspicious submission, using a lookback window rather than a global checkpoint.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000b1', 'ClaimRecoveryInterval', '60', 'number', 'claimRecovery',
    'Investor claim recovery runner interval in minutes.', FALSE),
  ('20000000-0000-4000-8000-0000000000b2', 'ClaimRecoveryBlockOffset', '1000', 'number', 'claimRecovery',
    'Block range (chunk) size per eth_getLogs request.', FALSE),
  ('20000000-0000-4000-8000-0000000000b3', 'ClaimRecoveryConfirmationBlocks', '2', 'number', 'claimRecovery',
    'Confirmation buffer; the runner never searches newer than LatestBlock - this value.', FALSE),
  ('20000000-0000-4000-8000-0000000000b4', 'ClaimRecoveryLookbackBlocks', '200000', 'number', 'claimRecovery',
    'How many blocks back from the safe head to search for a suspicious submission''s claim event.', FALSE),
  ('20000000-0000-4000-8000-0000000000b5', 'ClaimRecoveryBatchSize', '100', 'number', 'claimRecovery',
    'Maximum suspicious submissions processed per run.', FALSE),
  ('20000000-0000-4000-8000-0000000000b6', 'ClaimRecoveryEnabled', 'true', 'boolean', 'claimRecovery',
    'Master on/off switch for the background claim recovery runner.', FALSE)
ON DUPLICATE KEY UPDATE
  `valueType` = VALUES(`valueType`),
  `settingGroup` = VALUES(`settingGroup`),
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;
-- Note: settingValue is intentionally NOT overwritten on re-run so operator-tuned values persist.

-- Rollback (manual): DELETE FROM `generalSettings` WHERE `settingGroup` = 'claimRecovery';
