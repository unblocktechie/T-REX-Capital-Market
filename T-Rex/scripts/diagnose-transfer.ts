import 'dotenv/config';
import { ethers } from 'ethers';
import TREX from '@erc3643org/erc-3643';
import { getNetwork, deploymentsPathFor } from './network-config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Diagnoses exactly why `token.transfer(to, amount)` reverts for a specific
 * from/to/amount, by re-running every check Token.transfer() and
 * ModularCompliance.canTransfer() perform, individually and read-only
 * (no gas spent, nothing sent on-chain).
 *
 * Usage:
 *   npx ts-node scripts/diagnose-transfer.ts <tokenAddress> <fromAddress> <toAddress> <amount>
 *
 * <amount> is in human units (e.g. "5"), converted using the token's own
 * decimals() — same as what the frontend would send.
 */

const platformModuleArtifacts = {
  countryRestrict: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'contracts', 'modules', 'CountryRestrictModule.sol', 'CountryRestrictModule.json'), 'utf8')),
  maxBalance: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'contracts', 'modules', 'MaxBalanceModule.sol', 'MaxBalanceModule.json'), 'utf8')),
  maxInvestors: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'contracts', 'modules', 'MaxInvestorsModule.sol', 'MaxInvestorsModule.json'), 'utf8')),
};

async function main() {
  const [tokenAddress, fromAddress, toAddress, amountHuman] = process.argv.slice(2);
  if (!tokenAddress || !fromAddress || !toAddress || !amountHuman) {
    throw new Error('Usage: ts-node scripts/diagnose-transfer.ts <tokenAddress> <fromAddress> <toAddress> <amount>');
  }

  const provider = new ethers.JsonRpcProvider(getNetwork().rpcUrl);
  const token = new ethers.Contract(tokenAddress, TREX.contracts.Token.abi, provider);

  const decimals = await (token as any).decimals();
  const amount = ethers.parseUnits(amountHuman, decimals);
  console.log(`Checking transfer(from=${fromAddress}, to=${toAddress}, amount=${amountHuman} = ${amount} raw units, decimals=${decimals})\n`);

  // --- 1. Token-level checks (same order as Token.transfer()) ---
  console.log('--- Token-level checks ---');
  const paused = await (token as any).paused();
  console.log('paused():           ', paused, paused ? '✗ BLOCKS transfer' : '✓ ok');

  const fromFrozen = await (token as any).isFrozen(fromAddress);
  const toFrozen = await (token as any).isFrozen(toAddress);
  console.log('isFrozen(from):      ', fromFrozen, fromFrozen ? '✗ BLOCKS transfer' : '✓ ok');
  console.log('isFrozen(to):        ', toFrozen, toFrozen ? '✗ BLOCKS transfer' : '✓ ok');

  const balance = await (token as any).balanceOf(fromAddress);
  const frozenTokens = await (token as any).getFrozenTokens(fromAddress);
  const freeBalance = balance - frozenTokens;
  console.log('balanceOf(from):     ', ethers.formatUnits(balance, decimals));
  console.log('frozenTokens(from):  ', ethers.formatUnits(frozenTokens, decimals));
  console.log('freeBalance(from):   ', ethers.formatUnits(freeBalance, decimals), amount > freeBalance ? '✗ BLOCKS transfer (insufficient free balance)' : '✓ ok');

  const irAddress = await (token as any).identityRegistry();
  const ir = new ethers.Contract(irAddress, TREX.contracts.IdentityRegistry.abi, provider);
  const toVerified = await (ir as any).isVerified(toAddress);
  console.log('isVerified(to):      ', toVerified, toVerified ? '✓ ok' : '✗ BLOCKS transfer');

  // --- 2. Compliance-level checks ---
  console.log('\n--- Compliance module checks ---');
  const mcAddress = await (token as any).compliance();
  const mc = new ethers.Contract(mcAddress, TREX.contracts.ModularCompliance.abi, provider);
  console.log('ModularCompliance:   ', mcAddress);

  const overallCanTransfer = await (mc as any).canTransfer(fromAddress, toAddress, amount);
  console.log('canTransfer() overall:', overallCanTransfer, overallCanTransfer ? '✓ ok' : '✗ BLOCKS transfer — see per-module breakdown below');

  const boundModules: string[] = await (mc as any).getModules();
  console.log('\nBound modules (' + boundModules.length + '):', boundModules);

  for (const moduleAddress of boundModules) {
    const lower = moduleAddress.toLowerCase();
    let label = 'unknown module';
    let artifact: any;
    if (lower === (await resolveKnownAddress('countryRestrict')).toLowerCase()) {
      label = 'CountryRestrictModule';
      artifact = platformModuleArtifacts.countryRestrict;
    } else if (lower === (await resolveKnownAddress('maxBalance')).toLowerCase()) {
      label = 'MaxBalanceModule';
      artifact = platformModuleArtifacts.maxBalance;
    } else if (lower === (await resolveKnownAddress('maxInvestors')).toLowerCase()) {
      label = 'MaxInvestorsModule';
      artifact = platformModuleArtifacts.maxInvestors;
    }

    console.log(`\n  [${label}] ${moduleAddress}`);

    // moduleCheck(from, to, value, compliance) is the exact function
    // ModularCompliance.canTransfer() calls per module — call it directly to
    // see which specific module is the one returning false.
    const generic = new ethers.Contract(moduleAddress, ['function moduleCheck(address,address,uint256,address) external view returns (bool)'], provider);
    const individualResult = await (generic as any).moduleCheck(fromAddress, toAddress, amount, mcAddress);
    console.log('    moduleCheck():    ', individualResult, individualResult ? '✓ ok' : '✗ THIS MODULE BLOCKS THE TRANSFER');

    if (!artifact) continue;
    const detailed = new ethers.Contract(moduleAddress, artifact.abi, provider);

    if (label === 'MaxBalanceModule') {
      const max = await (detailed as any).getMaxBalance(mcAddress);
      const toBalance = await (token as any).balanceOf(toAddress);
      console.log('    getMaxBalance():  ', ethers.formatUnits(max, decimals), max === 0n ? '(0 = unlimited)' : '');
      console.log('    to balance + amount:', ethers.formatUnits(toBalance + amount, decimals));
    }

    if (label === 'MaxInvestorsModule') {
      const max = await (detailed as any).getMaxInvestors(mcAddress);
      const holderCount = await (detailed as any).getHolderCount(mcAddress);
      console.log('    getMaxInvestors():', max.toString(), max === 0n ? '(0 = unlimited)' : '');
      console.log('    getHolderCount(): ', holderCount.toString());
      console.log('    to is new holder: ', (await (token as any).balanceOf(toAddress)) === 0n);
    }

    if (label === 'CountryRestrictModule') {
      const toCountry = await (ir as any).investorCountry(toAddress);
      const restricted = await (detailed as any).isCountryRestricted(mcAddress, toCountry);
      console.log('    investorCountry(to):', toCountry);
      console.log('    isCountryRestricted:', restricted);
    }
  }

  async function resolveKnownAddress(key: 'countryRestrict' | 'maxBalance' | 'maxInvestors'): Promise<string> {
    const deploymentsPath = deploymentsPathFor(getNetwork().name);
    if (!fs.existsSync(deploymentsPath)) return ethers.ZeroAddress;
    const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    return deployment.platform?.complianceModules?.[key] || ethers.ZeroAddress;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
