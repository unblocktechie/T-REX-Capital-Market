import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * One command to verify every contract for a chain:
 *   1. verify-chain.ts — everything Hardhat's verify plugin can match directly.
 *   2. verify-idfactory.ts — always. Hardhat's recompile of IdFactory never
 *      matches on-chain bytecode (source-path difference, see that script),
 *      on any explorer, so this submits the npm package's original build.
 *   3. verify-large-contracts.ts and verify-trexfactory.ts — only on networks
 *      with a custom (non-Etherscan) explorer, i.e. explorerApiUrl set in
 *      networks.json (arc, robinhood, ...), whose request-size limit / path
 *      handling verify-chain.ts can't get past. On Etherscan-family explorers
 *      verify-chain.ts already covers those contracts.
 *
 * Every step runs even if an earlier one reports failures — verify-chain.ts
 * is expected to report failures for exactly the contracts the later steps
 * exist to handle. Exits non-zero at the end if any step failed.
 *
 * Usage: npm run verify:all -- --network <name>
 */

function main() {
  const networkName = parseNetworkArg();

  // Validates the network is actually defined before running anything.
  loadNetworkConfig(networkName);

  const networksJsonPath = path.join(__dirname, '..', 'networks.json');
  const networksJson = JSON.parse(fs.readFileSync(networksJsonPath, 'utf8'));
  const hasCustomExplorer = Boolean(networksJson[networkName]?.explorerApiUrl);

  const steps: { name: string; hardhat: boolean }[] = [
    { name: 'verify-chain.ts', hardhat: true },
    { name: 'verify-idfactory.ts', hardhat: false },
    ...(hasCustomExplorer
      ? [
          { name: 'verify-large-contracts.ts', hardhat: true },
          { name: 'verify-trexfactory.ts', hardhat: true },
        ]
      : []),
  ];

  console.log(`=== Verifying chain "${networkName}" (${steps.length} steps) ===\n`);

  const env = { ...process.env, NETWORK: networkName };
  const failedSteps: string[] = [];

  for (const [index, step] of steps.entries()) {
    const scriptPath = path.join(__dirname, step.name);
    const command = step.hardhat
      ? `npx hardhat run "${scriptPath}" --config hardhat.verify.config.ts --network ${networkName}`
      : `npx ts-node "${scriptPath}" --network ${networkName}`;

    console.log(`\n--- Step ${index + 1}/${steps.length}: ${step.name} ---`);
    try {
      execSync(command, { stdio: 'inherit', env });
    } catch {
      console.error(`\n(step ${step.name} reported failures — continuing with the remaining steps)`);
      failedSteps.push(step.name);
    }
  }

  console.log(`\n=== Finished verifying "${networkName}" ===`);
  if (failedSteps.length > 0) {
    console.log(`Steps that reported failures: ${failedSteps.join(', ')}`);
    console.log('verify-chain.ts failures on contracts a later step handled are expected — check each later step\'s own result above.');
    console.log('Anything still unverified: re-run this command (already-verified contracts are skipped quickly).');
    process.exitCode = 1;
  } else {
    console.log('All steps succeeded.');
  }
}

main();
