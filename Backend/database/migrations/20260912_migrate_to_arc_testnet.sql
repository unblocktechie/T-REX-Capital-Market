-- Migrate blockchain worker configuration from Ethereum Sepolia to Arc Testnet.
-- Arc Testnet chain ID: 5042002. Arc uses deterministic BFT finality, so one
-- committed block is sufficient for authoritative application confirmation.
--
-- Contract addresses and RPC credentials remain environment configuration.
-- Existing Sepolia business/audit rows are deliberately preserved; chain-scoped
-- indexers create independent checkpoints for Arc's chain ID.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

START TRANSACTION;

UPDATE `generalSettings`
SET
  `settingValue` = '1',
  `description` = CASE `settingKey`
    WHEN 'TrexDeploymentConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for TREX deployment synchronization.'
    WHEN 'ClaimRecoveryConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for claim recovery.'
    WHEN 'ClaimIndexerConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for claim indexing.'
    WHEN 'RegistryIndexerConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for registry indexing.'
    WHEN 'PurchaseIndexerConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for payment and mint indexing.'
    WHEN 'RedemptionConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for redemption settlement.'
    WHEN 'TransferIndexerConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for transfer indexing.'
    WHEN 'TransactionIndexerConfirmationBlocks' THEN 'Arc deterministic-finality confirmation threshold for canonical transaction history.'
    ELSE `description`
  END,
  `updatedAt` = UTC_TIMESTAMP(3)
WHERE `settingKey` IN (
  'TrexDeploymentConfirmationBlocks',
  'ClaimRecoveryConfirmationBlocks',
  'ClaimIndexerConfirmationBlocks',
  'RegistryIndexerConfirmationBlocks',
  'PurchaseIndexerConfirmationBlocks',
  'RedemptionConfirmationBlocks',
  'TransferIndexerConfirmationBlocks',
  'TransactionIndexerConfirmationBlocks'
)
  AND `isDeleted` = 0;

-- These settings are not chain-scoped. Reset the live checkpoint and seed the
-- Arc factory deployment block so the synchronizers neither reuse a Sepolia
-- height nor miss earlier Arc deployment events through bounded lookback.
UPDATE `generalSettings`
SET
  `settingValue` = CASE `settingKey`
    WHEN 'TrexDeploymentLastSyncBlock' THEN '0'
    WHEN 'TrexDeploymentStartBlock' THEN '60912630'
    WHEN 'ClaimIndexerStartBlock' THEN '60912630'
    WHEN 'RegistryIndexerStartBlock' THEN '60912630'
    ELSE `settingValue`
  END,
  `updatedAt` = UTC_TIMESTAMP(3)
WHERE `settingKey` IN (
  'TrexDeploymentLastSyncBlock',
  'TrexDeploymentStartBlock',
  'ClaimIndexerStartBlock',
  'RegistryIndexerStartBlock'
)
  AND `isDeleted` = 0;

COMMIT;

-- Operational note:
-- The TREX factory was deployed at Arc block 60912630 and the Platform Controller
-- at block 61037545. Environment-backed indexers use those starts as documented
-- in .env.example; adjust them only when replacing either deployment.
