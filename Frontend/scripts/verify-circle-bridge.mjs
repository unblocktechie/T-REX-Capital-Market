import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const clean = (value) => String(value ?? '').trim().replace(/^['"]|['"]$/g, '');

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), clean(line.slice(index + 1))];
      }),
  );
};

const compareVersions = (left, right) => {
  const a = clean(left).replace(/^[^0-9]*/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = clean(right).replace(/^[^0-9]*/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
};

const fail = (messages) => {
  console.error('\nCircle bridge preflight failed:\n');
  messages.forEach((message) => console.error(`  - ${message}`));
  console.error('\nFix the configuration/dependencies before building or serving this profile.\n');
  process.exit(1);
};

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const modeArg = clean(process.argv[2]);
const baseEnv = parseEnvFile(path.join(root, '.env'));
const mode = modeArg || clean(baseEnv.VITE_BRIDGE_ENVIRONMENT) || 'testnet';
const modeEnv = parseEnvFile(path.join(root, `.env.${mode}`));
const env = { ...baseEnv, ...modeEnv };
const problems = [];

const appKitVersion = packageJson.dependencies?.['@circle-fin/app-kit'];
const adapterVersion = packageJson.dependencies?.['@circle-fin/adapter-viem-v2'];

if (!appKitVersion || compareVersions(appKitVersion, '1.15.0') < 0) {
  problems.push(`@circle-fin/app-kit must be >= 1.15.0 for Arc Mainnet bridging; found ${appKitVersion || 'missing'}.`);
}
if (!adapterVersion || compareVersions(adapterVersion, '1.18.0') < 0) {
  problems.push(`@circle-fin/adapter-viem-v2 must be >= 1.18.0 for this production bridge profile; found ${adapterVersion || 'missing'}.`);
}

const profiles = {
  mainnet: {
    bridgeEnvironment: 'mainnet',
    arcChainId: '5042',
    walletViewChainId: '1',
    source: 'Ethereum',
    destination: 'Arc',
  },
  testnet: {
    bridgeEnvironment: 'testnet',
    arcChainId: '5042002',
    walletViewChainId: '11155111',
    source: 'Ethereum_Sepolia',
    destination: 'Arc_Testnet',
  },
};

const profile = profiles[mode];
if (!profile) {
  problems.push(`Unsupported bridge build profile "${mode}". Expected "testnet" or "mainnet".`);
} else {
  const checks = [
    ['VITE_BRIDGE_ENVIRONMENT', profile.bridgeEnvironment],
    ['VITE_ARC_CHAIN_ID', profile.arcChainId],
    ['VITE_WALLET_VIEW_CHAIN_ID', profile.walletViewChainId],
    ['VITE_BRIDGE_SOURCE_APP_KIT_CHAIN', profile.source],
    ['VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN', profile.destination],
  ];
  checks.forEach(([key, expected]) => {
    const actual = clean(env[key]);
    if (actual !== expected) problems.push(`${key} must be "${expected}" for ${mode}; found "${actual || 'missing'}".`);
  });
}

if (clean(env.VITE_BRIDGE_MAX_FEE)) {
  problems.push('VITE_BRIDGE_MAX_FEE must be empty; let Circle calculate the current CCTP fee so small transfers are not rejected by a stale fixed maxFee.');
}

for (const key of ['VITE_BRIDGE_FALLBACK_SOURCE_GAS_UNITS', 'VITE_BRIDGE_FALLBACK_DESTINATION_GAS_UNITS']) {
  const value = Number.parseInt(clean(env[key]), 10);
  if (!Number.isSafeInteger(value) || value < 200000) {
    problems.push(`${key} must be an integer >= 200000 so the RPC gas fallback cannot be accidentally configured with an unsafe reserve; found "${clean(env[key]) || 'missing'}".`);
  }
}

if (problems.length) fail(problems);

console.log(
  `Circle bridge preflight OK (${mode}): ${env.VITE_BRIDGE_SOURCE_APP_KIT_CHAIN} -> ${env.VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN}, self-mint flow, Circle+RPC hybrid gas validation, SDK-managed maxFee, App Kit ${appKitVersion}, adapter ${adapterVersion}.`,
);
