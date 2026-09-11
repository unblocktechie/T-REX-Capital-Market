import * as fs from 'fs';
import * as path from 'path';

/**
 * Copies the compiled artifacts for the contracts that diverge from the
 * published `@erc3643org/erc-3643` npm package (currently: TREXFactory,
 * TokenPriceStorage) out of the local ERC-3643 checkout and into
 * vendor/erc3643/ in THIS project.
 *
 * Run this any time contracts/factory/TREXFactory.sol or
 * contracts/token/TokenPriceStorage.sol change in the ERC-3643 repo:
 *
 *   cd <path-to-ERC-3643>
 *   npx hardhat compile
 *   cd <path-to-T-Rex>
 *   npm run sync:erc3643-artifacts
 *
 * This removes the sibling-directory path dependency at deploy time — the
 * deploy scripts only ever read from vendor/erc3643/ inside this project,
 * which is a plain checked-in copy, not a live reference to another repo.
 */

const erc3643LocalPath = process.env.ERC3643_LOCAL_PATH || path.join(__dirname, '..', '..', '..', 'ERC-3643');
const vendorRoot = path.join(__dirname, '..', 'vendor', 'erc3643', 'artifacts', 'contracts');

// relative to <repo>/artifacts/contracts/...
const artifactsToSync = [path.join('factory', 'TREXFactory.sol', 'TREXFactory.json'), path.join('token', 'TokenPriceStorage.sol', 'TokenPriceStorage.json')];

function main() {
  const sourceRoot = path.join(erc3643LocalPath, 'artifacts', 'contracts');
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Could not find ${sourceRoot}. Run "npx hardhat compile" in ${erc3643LocalPath} first, ` + `or set ERC3643_LOCAL_PATH in .env to point at your local ERC-3643 checkout.`);
  }

  for (const relativePath of artifactsToSync) {
    const source = path.join(sourceRoot, relativePath);
    const dest = path.join(vendorRoot, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing compiled artifact: ${source}`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    console.log(`Synced ${relativePath}`);
  }

  console.log('\nDone. vendor/erc3643/ now matches the local ERC-3643 build.');
}

main();

