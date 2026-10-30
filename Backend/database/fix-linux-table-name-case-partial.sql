-- T-REX Capital Market: idempotent Linux MySQL table-name case repair.
--
-- Use this script when an earlier repair renamed only some tables. It requires
-- an administrative MySQL account that can read information_schema.TABLES.
-- Fully repaired camelCase tables are left unchanged; lowercase tables are
-- renamed to the exact identifiers used by the backend.
--
-- Before running:
-- 1. Back up the database.
-- 2. Stop the backend and background workers.
-- 3. Select the application database.

DROP PROCEDURE IF EXISTS `normalizeTrexTableCase`;

DELIMITER $$

CREATE PROCEDURE `normalizeTrexTableCase`(IN canonicalName VARCHAR(64))
BEGIN
  DECLARE canonicalCount INT DEFAULT 0;
  DECLARE lowercaseCount INT DEFAULT 0;
  DECLARE lowercaseName VARCHAR(64);
  DECLARE failureMessage VARCHAR(255);

  IF DATABASE() IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No database selected before table-case repair.';
  END IF;

  IF @@lower_case_table_names <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Table-case repair requires lower_case_table_names=0.';
  END IF;

  SET lowercaseName = LOWER(canonicalName);

  SELECT COUNT(*)
    INTO canonicalCount
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_TYPE = 'BASE TABLE'
    AND BINARY TABLE_NAME = BINARY canonicalName;

  IF canonicalCount = 0 THEN
    SELECT COUNT(*)
      INTO lowercaseCount
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
      AND BINARY TABLE_NAME = BINARY lowercaseName;

    IF lowercaseCount = 1 THEN
      SET @renameTableSql = CONCAT(
        'RENAME TABLE `', lowercaseName, '` TO `', canonicalName, '`'
      );
      PREPARE renameTableStatement FROM @renameTableSql;
      EXECUTE renameTableStatement;
      DEALLOCATE PREPARE renameTableStatement;
    ELSE
      SET failureMessage = CONCAT(
        'Missing table for canonical identifier ', canonicalName,
        ' (expected ', lowercaseName, ' or ', canonicalName, ').'
      );
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = failureMessage;
    END IF;
  END IF;
END$$

DELIMITER ;

CALL `normalizeTrexTableCase`('authToken');
CALL `normalizeTrexTableCase`('blockchainIndexerCheckpoint');
CALL `normalizeTrexTableCase`('blockchainIndexedContract');
CALL `normalizeTrexTableCase`('blockchainTransaction');
CALL `normalizeTrexTableCase`('chainMaster');
CALL `normalizeTrexTableCase`('chainMasterAudit');
CALL `normalizeTrexTableCase`('cityMaster');
CALL `normalizeTrexTableCase`('claimTopicMaster');
CALL `normalizeTrexTableCase`('countryMaster');
CALL `normalizeTrexTableCase`('documentTypeMaster');
CALL `normalizeTrexTableCase`('entityTypeMaster');
CALL `normalizeTrexTableCase`('generalSettings');
CALL `normalizeTrexTableCase`('identityRegistryBlockchainEvent');
CALL `normalizeTrexTableCase`('identityRegistryRegistration');
CALL `normalizeTrexTableCase`('industryMaster');
CALL `normalizeTrexTableCase`('investmentSubmissionDocument');
CALL `normalizeTrexTableCase`('investorClaimBlockchainEvent');
CALL `normalizeTrexTableCase`('investorClaimSubmission');
CALL `normalizeTrexTableCase`('investorDocument');
CALL `normalizeTrexTableCase`('investorDocumentTypeMaster');
CALL `normalizeTrexTableCase`('investorInvestmentCategory');
CALL `normalizeTrexTableCase`('investorInvitation');
CALL `normalizeTrexTableCase`('investorMaster');
CALL `normalizeTrexTableCase`('issuerClaimSignature');
CALL `normalizeTrexTableCase`('issuerClaimVerification');
CALL `normalizeTrexTableCase`('menuMaster');
CALL `normalizeTrexTableCase`('organizationBeneficialOwner');
CALL `normalizeTrexTableCase`('organizationDocument');
CALL `normalizeTrexTableCase`('organizationMaster');
CALL `normalizeTrexTableCase`('paymentTokenMaster');
CALL `normalizeTrexTableCase`('permissionMaster');
CALL `normalizeTrexTableCase`('stateMaster');
CALL `normalizeTrexTableCase`('tokenClaimTopic');
CALL `normalizeTrexTableCase`('tokenCountryRestriction');
CALL `normalizeTrexTableCase`('tokenDeploymentAttempt');
CALL `normalizeTrexTableCase`('tokenInvestmentInterest');
CALL `normalizeTrexTableCase`('tokenInvestmentInterestHistory');
CALL `normalizeTrexTableCase`('tokenMaster');
CALL `normalizeTrexTableCase`('tokenPurchase');
CALL `normalizeTrexTableCase`('tokenPurchasePaymentEvent');
CALL `normalizeTrexTableCase`('tokenPurchaseTransaction');
CALL `normalizeTrexTableCase`('tokenRedemption');
CALL `normalizeTrexTableCase`('tokenRedemptionHistory');
CALL `normalizeTrexTableCase`('tokenRedemptionPaymentEvent');
CALL `normalizeTrexTableCase`('tokenRedemptionTransaction');
CALL `normalizeTrexTableCase`('tokenTransfer');
CALL `normalizeTrexTableCase`('tokenTransferBlockchainEvent');
CALL `normalizeTrexTableCase`('tokenTransferTransaction');
CALL `normalizeTrexTableCase`('userChainIdentity');
CALL `normalizeTrexTableCase`('userMaster');
CALL `normalizeTrexTableCase`('userRole');

DROP PROCEDURE `normalizeTrexTableCase`;

SHOW TABLES;
