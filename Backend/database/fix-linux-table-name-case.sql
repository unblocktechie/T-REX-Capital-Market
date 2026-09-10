-- T-REX Capital Market: one-time Linux MySQL table-name case repair.
--
-- This script intentionally does not query information_schema because some hosted
-- MySQL accounts are denied access to that system database.
--
-- Before running:
-- 1. Back up the application database.
-- 2. Stop the backend.
-- 3. Select the imported T-REX Capital Market database (or run USE `yourDatabaseName`;).
-- 4. Run this script once only on the Linux database whose imported table names
--    are all lowercase.
--
-- RENAME TABLE is one statement so MySQL does not leave a partially renamed schema
-- if a source table is missing or a destination name already exists.

RENAME TABLE
  `authtoken` TO `authToken`,
  `blockchainindexercheckpoint` TO `blockchainIndexerCheckpoint`,
  `citymaster` TO `cityMaster`,
  `claimtopicmaster` TO `claimTopicMaster`,
  `countrymaster` TO `countryMaster`,
  `documenttypemaster` TO `documentTypeMaster`,
  `entitytypemaster` TO `entityTypeMaster`,
  `generalsettings` TO `generalSettings`,
  `identityregistryblockchainevent` TO `identityRegistryBlockchainEvent`,
  `identityregistryregistration` TO `identityRegistryRegistration`,
  `industrymaster` TO `industryMaster`,
  `investmentsubmissiondocument` TO `investmentSubmissionDocument`,
  `investorclaimblockchainevent` TO `investorClaimBlockchainEvent`,
  `investorclaimsubmission` TO `investorClaimSubmission`,
  `investordocument` TO `investorDocument`,
  `investordocumenttypemaster` TO `investorDocumentTypeMaster`,
  `investorinvestmentcategory` TO `investorInvestmentCategory`,
  `investorinvitation` TO `investorInvitation`,
  `investormaster` TO `investorMaster`,
  `issuerclaimsignature` TO `issuerClaimSignature`,
  `issuerclaimverification` TO `issuerClaimVerification`,
  `menumaster` TO `menuMaster`,
  `organizationbeneficialowner` TO `organizationBeneficialOwner`,
  `organizationdocument` TO `organizationDocument`,
  `organizationmaster` TO `organizationMaster`,
  `permissionmaster` TO `permissionMaster`,
  `statemaster` TO `stateMaster`,
  `tokenclaimtopic` TO `tokenClaimTopic`,
  `tokencountryrestriction` TO `tokenCountryRestriction`,
  `tokendeploymentattempt` TO `tokenDeploymentAttempt`,
  `tokeninvestmentinterest` TO `tokenInvestmentInterest`,
  `tokeninvestmentinteresthistory` TO `tokenInvestmentInterestHistory`,
  `tokenmaster` TO `tokenMaster`,
  `tokenpurchase` TO `tokenPurchase`,
  `tokenpurchasepaymentevent` TO `tokenPurchasePaymentEvent`,
  `tokenpurchasetransaction` TO `tokenPurchaseTransaction`,
  `tokenredemption` TO `tokenRedemption`,
  `tokenredemptionhistory` TO `tokenRedemptionHistory`,
  `tokenredemptionpaymentevent` TO `tokenRedemptionPaymentEvent`,
  `tokenredemptiontransaction` TO `tokenRedemptionTransaction`,
  `tokentransfer` TO `tokenTransfer`,
  `tokentransferblockchainevent` TO `tokenTransferBlockchainEvent`,
  `tokentransfertransaction` TO `tokenTransferTransaction`,
  `usermaster` TO `userMaster`,
  `userrole` TO `userRole`;

SHOW TABLES;
