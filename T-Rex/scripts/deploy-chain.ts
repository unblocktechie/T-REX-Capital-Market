import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * One command to stand up a new chain: runs the platform contracts,
 * compliance modules, and platform controller deploy scripts in order
 * against the given --network.
 *
 * Usage: npm run deploy:chain -- --network <name>
 *
 * To add a new chain: add an entry to networks.json, set its RPC URL env
 * var in .env, then run this.
 */

const STEPS = ['phase0-01-deploy-platform.ts', 'deploy-compliance-modules.ts', 'deploy-platform-controller.ts'];

function main() {
  const networkName = parseNetworkArg();
  const force = process.argv.includes('--force');

  // Validates the network is actually defined before running anything.
  const networkConfig = loadNetworkConfig(networkName);

  if (fs.existsSync(networkConfig.deploymentsPath) && !force) {
    throw new Error(
      `${networkConfig.deploymentsPath} already exists — "${networkName}" looks already deployed. ` +
        'Delete the file (or move it aside) if you really want to redeploy from scratch, or pass --force.',
    );
  }

  console.log(`=== Deploying chain "${networkName}" (${STEPS.length} steps) ===\n`);

  for (const [index, step] of STEPS.entries()) {
    console.log(`\n--- Step ${index + 1}/${STEPS.length}: ${step} ---`);
    const scriptPath = path.join(__dirname, step);
    try {
      execSync(`npx ts-node "${scriptPath}" --network ${networkName}`, { stdio: 'inherit' });
    } catch (error) {
      console.error(`\n=== Failed at step ${index + 1}/${STEPS.length}: ${step} ===`);
      console.error(`Fix the issue above, then re-run: npx ts-node scripts/${step} --network ${networkName}`);
      console.error('(and any remaining steps by hand — the orchestrator stops on first failure.)');
      throw error;
    }
  }

  console.log(`\n=== Done — "${networkName}" fully deployed ===`);
  console.log('Saved to', networkConfig.deploymentsPath);
}

main();
