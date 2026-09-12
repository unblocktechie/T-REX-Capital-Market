import 'dotenv/config';
import { ethers } from 'ethers';
import OnchainID from '@onchain-id/solidity';
import TREX from '@erc3643org/erc-3643';
import * as fs from 'fs';
import * as path from 'path';
import { getNetwork, deploymentsPathFor } from './network-config';

// TREXFactory.getTokenPriceStorage() and the TokenPriceStorage contract itself
// aren't in the npm package yet (see phase0-01b-redeploy-factory.ts) — read
// their ABI from the vendored local build instead. Keep in sync via
// `npm run sync:erc3643-artifacts`.
const trexFactoryLocalArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'vendor', 'erc3643', 'artifacts', 'contracts', 'factory', 'TREXFactory.sol', 'TREXFactory.json'), 'utf8'),
);
const tokenPriceStorageArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'vendor', 'erc3643', 'artifacts', 'contracts', 'token', 'TokenPriceStorage.sol', 'TokenPriceStorage.json'), 'utf8'),
);

/**
 * Phase 0 / Step 2 — deploy ONE issuer's own 6 contracts through the shared Gateway.
 *
 * This is the exact call your backend's "Create Token" endpoint will make.
 *
 * Ownership model (verified against TREXFactory.sol's deployTREXSuite):
 *   - The PLATFORM wallet signs and pays gas for this transaction (it's the
 *     approved deployer) — that's just gas sponsorship, not ownership.
 *   - `owner`, `irAgents`, `tokenAgents` are all set to the ISSUER's own wallet.
 *     By the end of this one transaction, the issuer's wallet is the real
 *     on-chain owner of Token/IdentityRegistry/TrustedIssuersRegistry/
 *     ClaimTopicsRegistry/ModularCompliance, and a functioning agent on both
 *     the Token and the IdentityRegistry. The platform wallet has zero
 *     ongoing authority over this token after this transaction confirms.
 */

const deploymentsPath = deploymentsPathFor(getNetwork().name);

/**
 * Turns the issuer's business-level compliance choices (whatever their
 * "Create Token" form collected) into the two index-paired arrays
 * deployTREXSuite actually wants: complianceModules[i] is a shared module
 * address (deployed once, see deploy-compliance-modules.ts); complianceSettings[i]
 * is ABI-encoded calldata for that module's own setter, applied via
 * ModularCompliance.callModuleFunction inside the same deploy transaction.
 * Any of the three rules can be omitted if this issuer doesn't want it.
 */
function buildComplianceArrays(
  compliance: { restrictedCountries?: number[]; maxBalancePerHolder?: string; maxInvestors?: number },
  decimals: number,
  moduleAddresses: { countryRestrict: string; maxBalance: string; maxInvestors: string },
) {
  const complianceModules: string[] = [];
  const complianceSettings: string[] = [];

  if (compliance.restrictedCountries?.length) {
    const iface = new ethers.Interface(['function batchRestrictCountries(uint16[] _countries)']);
    complianceModules.push(moduleAddresses.countryRestrict);
    complianceSettings.push(iface.encodeFunctionData('batchRestrictCountries', [compliance.restrictedCountries]));
  }

  if (compliance.maxBalancePerHolder) {
    const iface = new ethers.Interface(['function setMaxBalance(uint256 _max)']);
    complianceModules.push(moduleAddresses.maxBalance);
    complianceSettings.push(
      iface.encodeFunctionData('setMaxBalance', [ethers.parseUnits(compliance.maxBalancePerHolder, decimals)]),
    );
  }

  if (compliance.maxInvestors) {
    const iface = new ethers.Interface(['function setMaxInvestors(uint256 _max)']);
    complianceModules.push(moduleAddresses.maxInvestors);
    complianceSettings.push(iface.encodeFunctionData('setMaxInvestors', [compliance.maxInvestors]));
  }

  return { complianceModules, complianceSettings };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(getNetwork().rpcUrl);
  const platform = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY as string, provider);
  const issuerAddress = process.env.ISSUER_ADDRESS as string;
  const issuerSigner = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY as string, provider);

  const platformDeployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const gatewayAddress = platformDeployment.platform.trexGateway;

  const gateway = new ethers.Contract(gatewayAddress, TREX.contracts.TREXGateway.abi, platform);

  // The trusted claim issuer must be a CONTRACT implementing isClaimValid
  // (an IClaimIssuer) — the issuer's raw wallet address has no code and would
  // silently break isVerified() later. Read back the ONCHAINID identity that
  // create-organization-identity.ts already created for this issuer at
  // approval time (see IdFactory.getIdentity).
  const identityFactory = new ethers.Contract(
    platformDeployment.platform.identityFactory,
    OnchainID.contracts.Factory.abi,
    provider,
  );
  const issuerIdentityAddress = await (identityFactory as any).getIdentity(issuerAddress);
  if (issuerIdentityAddress === ethers.ZeroAddress) {
    throw new Error(`Issuer ${issuerAddress} has no ONCHAINID identity yet — run the org-approval step first`);
  }

  const decimals = 0;
  const { complianceModules, complianceSettings } = buildComplianceArrays(
    {
      restrictedCountries: [840, 408], // sample: block USA, North Korea — comes from the issuer's form in a real backend
      maxBalancePerHolder: '1000',
      maxInvestors: 200,
    },
    decimals,
    platformDeployment.platform.complianceModules,
  );

  const tokenDetails = {
    owner: issuerAddress,
    name: 'Test Security Token',
    symbol: 'TST',
    decimals,
    irs: ethers.ZeroAddress, // deploy a fresh identity registry storage
    ONCHAINID: ethers.ZeroAddress, // let the factory auto-create the token's own onchain identity
    irAgents: [issuerAddress], // issuer can register/manage investor identities on THEIR registry
    tokenAgents: [issuerAddress], // issuer can mint/burn/freeze on THEIR token
    complianceModules,
    complianceSettings,
    initialPrice: ethers.parseEther('10'), // sample: 10 (18-decimals) per token — comes from the issuer's form in a real backend, cannot be zero
  };
  const claimDetails = {
    claimTopics: [1, 2],
    issuers: [issuerIdentityAddress], // the issuer's own ONCHAINID identity, not their wallet
    issuerClaims: [[1, 2]],
  };

  console.log('--- Deploying issuer suite through the Gateway ---');
  console.log('Signed by (gas sponsor): platform wallet', platform.address);
  console.log('owner / irAgents / tokenAgents:            issuer wallet', issuerAddress);

  const tx = await (gateway as any).deployTREXSuite(tokenDetails, claimDetails);
  console.log('\nSubmitted, tx', tx.hash, '— waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('Confirmed in block', receipt.blockNumber);

  // TREXSuiteDeployed is emitted by the Factory, called internally by the Gateway
  // in the same transaction — so it shows up in this receipt's logs. Parse with
  // the vendored (local-build) ABI, since it also knows about the new
  // TokenPriceStorageDeployed event that the npm package's ABI doesn't have.
  const factoryInterfaceLocal = new ethers.Interface(trexFactoryLocalArtifact.abi);
  let suite: { token: string; ir: string; irs: string; tir: string; ctr: string; mc: string } | undefined;
  let priceStorageAddress: string | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = factoryInterfaceLocal.parseLog(log);
      if (parsed?.name === 'TREXSuiteDeployed') {
        suite = {
          token: parsed.args._token,
          ir: parsed.args._ir,
          irs: parsed.args._irs,
          tir: parsed.args._tir,
          ctr: parsed.args._ctr,
          mc: parsed.args._mc,
        };
      }
      if (parsed?.name === 'TokenPriceStorageDeployed') {
        priceStorageAddress = parsed.args._priceStorage;
      }
    } catch {
      // not a Factory log, ignore
    }
  }
  if (!suite) {
    throw new Error('TREXSuiteDeployed event not found in receipt — deployment likely failed silently');
  }
  if (!priceStorageAddress) {
    throw new Error('TokenPriceStorageDeployed event not found in receipt — is the Gateway pointed at the updated TREXFactory? (see phase0-01b-redeploy-factory.ts)');
  }

  console.log('\n--- New per-issuer addresses ---');
  console.log(suite);
  console.log('priceStorage:', priceStorageAddress);

  // --- Read the on-chain price back (source of truth, not the backend) ---
  const priceStorage = new ethers.Contract(priceStorageAddress, tokenPriceStorageArtifact.abi, provider);
  const [, onChainInitialPrice, onChainCurrentPrice] = await (priceStorage as any).getPriceInfo();
  console.log('\n--- On-chain price ---');
  console.log('initialPrice:', ethers.formatEther(onChainInitialPrice));
  console.log('currentPrice:', ethers.formatEther(onChainCurrentPrice));

  // --- Verify ownership actually landed on the issuer, not the platform ---
  console.log('\n--- Verifying on-chain ownership (read-only calls) ---');
  const token = new ethers.Contract(suite.token, TREX.contracts.Token.abi, provider);
  const ir = new ethers.Contract(suite.ir, TREX.contracts.IdentityRegistry.abi, provider);

  const tokenOwner = await (token as any).owner();
  const irOwner = await (ir as any).owner();
  const issuerIsTokenAgent = await (token as any).isAgent(issuerAddress);
  const issuerIsIrAgent = await (ir as any).isAgent(issuerAddress);
  const platformIsTokenAgent = await (token as any).isAgent(platform.address);

  console.log('Token.owner()           :', tokenOwner, tokenOwner === issuerAddress ? '✓ issuer' : '✗ WRONG');
  console.log('IdentityRegistry.owner():', irOwner, irOwner === issuerAddress ? '✓ issuer' : '✗ WRONG');
  console.log('issuer isAgent(Token)   :', issuerIsTokenAgent);
  console.log('issuer isAgent(IR)      :', issuerIsIrAgent);
  console.log('platform isAgent(Token) :', platformIsTokenAgent, platformIsTokenAgent ? '✗ platform should NOT be an agent' : '✓ correct, platform has no power here');

  // --- Prove it, not just assert it: issuer's own wallet signs the unpause call ---
  console.log("\n--- Issuer's own wallet unpauses their new token (proves their key actually has agent rights) ---");
  const tokenAsIssuer = new ethers.Contract(suite.token, TREX.contracts.Token.abi, issuerSigner);
  const unpauseTx = await (tokenAsIssuer as any).unpause();
  await unpauseTx.wait();
  console.log('  -> unpaused by issuer wallet (tx', unpauseTx.hash, ')');

  // --- Persist ---
  platformDeployment.issuers = platformDeployment.issuers || [];
  platformDeployment.issuers.push({
    name: tokenDetails.name,
    symbol: tokenDetails.symbol,
    ownerWallet: issuerAddress,
    deployedAt: new Date().toISOString(),
    deployTx: tx.hash,
    contracts: { ...suite, priceStorage: priceStorageAddress },
    initialPrice: ethers.formatEther(onChainInitialPrice),
  });
  fs.writeFileSync(deploymentsPath, JSON.stringify(platformDeployment, null, 2));
  console.log('\nSaved to', deploymentsPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// create token for investor who has zero token only 

// organizationId	FK to the org/issuer table
// name, symbol, decimals	mirrors what gets sent as tokenDetails
// displayName / description	marketplace listing copy — separate from the on-chain name, since marketing copy ≠ contract name
// logoUrl, bannerUrl	for the marketplace card/detail page
// category (e.g. Real Estate, Equity, Debt Fund)	filtering in the marketplace
// totalSupply / targetRaiseAmount	offering size
// pricePerToken, currency	investor-facing economics
// minimumInvestment	subscription floor
// offeringStartDate, offeringEndDate	subscription window
// jurisdiction / restrictedCountries	compliance filtering shown to investors
// documentUrls (prospectus, term sheet)	due-diligence materials
// requiredClaimTopics (e.g. [1, 2])	so investor-onboarding flow knows what KYC/claims they'll need before they can invest
// status	'pending' at this point

// tokenAddress	suite.token
// identityRegistryAddress	suite.ir
// identityRegistryStorageAddress	suite.irs
// trustedIssuersRegistryAddress	suite.tir
// claimTopicsRegistryAddress	suite.ctr
// modularComplianceAddress	suite.mc
// tokenOnchainID	the token's own auto-created ONCHAINID (from token.setOnchainID / TokenLinked event, if you want it)
// ownerWalletAddress	tokenDetails.owner (should match organizationId's stored wallet — per your earlier point, never trust a client-supplied value here)
// deployTxHash, deployedAtBlock, deployedAt	receipt.hash, receipt.blockNumber, timestamp
// chainId / network	'arcTestnet', 'sepolia' etc.
// status	flip to 'deployed' (or 'failed' + errorMessage if the tx reverts)
// isPaused	starts true — flip to false once the issuer calls unpause() later

//  InvestmentInterest table: id, tokenId (FK), investorId (FK), amountInterested, status (submitted / approved / rejected), createdAt