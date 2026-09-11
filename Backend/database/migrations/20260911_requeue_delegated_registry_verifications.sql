-- Requeue registry operations rejected by the legacy direct-only tx.to verifier even though the
-- durable indexer stored an exact canonical IdentityRegistered event for the same transaction,
-- registry, investor wallet and ONCHAINID. This never confirms an operation; the upgraded verifier
-- must independently decode and verify the transaction first.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

START TRANSACTION;

UPDATE `identityRegistryBlockchainEvent` AS e
INNER JOIN `identityRegistryRegistration` AS r
  ON r.`chainId` = e.`chainId`
 AND LOWER(r.`txHash`) = LOWER(e.`txHash`)
 AND LOWER(r.`identityRegistryAddress`) = LOWER(e.`identityRegistryAddress`)
 AND LOWER(r.`investorWalletAddress`) = LOWER(e.`investorWalletAddress`)
 AND LOWER(r.`investorIdentityAddress`) = LOWER(e.`investorIdentityAddress`)
SET e.`processingStatus` = 'NEW',
    e.`matchedRegistrationUid` = NULL,
    e.`processingAttempts` = 0,
    e.`processingMessage` = 'Requeued after delegated registry verification support was deployed.',
    e.`processedAt` = NULL,
    e.`updatedAt` = UTC_TIMESTAMP(3)
WHERE r.`status` = 'PENDING'
  AND r.`errorCode` = 'INVALID_REGISTRY_CONTRACT'
  AND r.`isDeleted` = 0
  AND e.`isCanonical` = 1
  AND e.`isDeleted` = 0;

UPDATE `identityRegistryRegistration` AS r
SET r.`errorCode` = NULL,
    r.`errorMessage` = NULL,
    r.`syncStatus` = 'QUEUED',
    r.`syncRequestedAt` = UTC_TIMESTAMP(3),
    r.`nextSyncAt` = UTC_TIMESTAMP(3),
    r.`updatedAt` = UTC_TIMESTAMP(3)
WHERE r.`status` = 'PENDING'
  AND r.`errorCode` = 'INVALID_REGISTRY_CONTRACT'
  AND r.`txHash` IS NOT NULL
  AND r.`isDeleted` = 0
  AND EXISTS (
    SELECT 1
    FROM `identityRegistryBlockchainEvent` AS e
    WHERE e.`chainId` = r.`chainId`
      AND LOWER(e.`txHash`) = LOWER(r.`txHash`)
      AND LOWER(e.`identityRegistryAddress`) = LOWER(r.`identityRegistryAddress`)
      AND LOWER(e.`investorWalletAddress`) = LOWER(r.`investorWalletAddress`)
      AND LOWER(e.`investorIdentityAddress`) = LOWER(r.`investorIdentityAddress`)
      AND e.`isCanonical` = 1
      AND e.`isDeleted` = 0
  );

COMMIT;
