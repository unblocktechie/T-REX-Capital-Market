import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * One command to stand up a NEW chain, with every contract deployed from
 * this project's own compiled build so it verifies with a plain
 * `npm run verify:new-chain -- --network <name>` afterwards.
 *
 * Steps:
 *   0. compile — main build (our contracts) + hardhat.verify.config.ts build
 *      (T-REX / ONCHAINID from their npm sources, plus our contracts)
 *   1. deploy-platform-from-source.ts
 *   2. deploy-compliance-modules.ts
 *   3. deploy-platform-controller.ts
 *   4. deploy-id-factory-access-manager.ts
 *
 * Usage: npm run deploy:new-chain -- --network <name>
 *
 * Resumable: if a run fails partway, re-run the exact same command — every
 * step skips what's already on-chain and continues where it stopped.
 *
 * --force starts over from scratch (new addresses for everything). The
 * existing deployments/<network>.json is moved aside to a timestamped
 * .bak.json file, never deleted, so old addresses are never lost.
 */

const STEPS = [
  'deploy-platform-from-source.ts',
  'deploy-compliance-modules.ts',
  'deploy-platform-controller.ts',
  'deploy-id-factory-access-manager.ts',
];

function main() {
  const networkName = parseNetworkArg();
  const force = process.argv.includes('--force');
  const networkConfig = loadNetworkConfig(networkName);
  const deploymentsPath = networkConfig.deploymentsPath;

  if (fs.existsSync(deploymentsPath)) {
    if (force) {
      const backupPath = deploymentsPath.replace(/\.json$/, `.${new Date().toISOString().replace(/[:.]/g, '-')}.bak.json`);
      fs.renameSync(deploymentsPath, backupPath);
      console.log(`--force: moved ${deploymentsPath} to ${backupPath}, deploying "${networkName}" from scratch.\n`);
    } else {
      console.log(`${deploymentsPath} already exists — resuming "${networkName}", skipping anything already on-chain.\n`);
    }
  }

  console.log(`=== Deploying new chain "${networkName}" ===\n`);

  console.log('--- Step 0: compiling ---');
  execSync('npx hardhat compile', { stdio: 'inherit' });
  execSync('npx hardhat compile --config hardhat.verify.config.ts', { stdio: 'inherit' });

  for (const [index, step] of STEPS.entries()) {
    console.log(`\n--- Step ${index + 1}/${STEPS.length}: ${step} ---`);
    try {
      execSync(`npx ts-node "${path.join(__dirname, step)}" --network ${networkName}`, { stdio: 'inherit' });
    } catch (error) {
      console.error(`\n=== Failed at step ${index + 1}/${STEPS.length}: ${step} ===`);
      console.error(`Fix the issue above, then re-run: npm run deploy:new-chain -- --network ${networkName}`);
      console.error('(it resumes — everything already deployed is skipped.)');
      throw error;
    }
  }

  console.log(`\n=== Done — "${networkName}" fully deployed ===`);
  console.log('Saved to', deploymentsPath);
  console.log(`Next: npm run verify:new-chain -- --network ${networkName}`);
}

main();
