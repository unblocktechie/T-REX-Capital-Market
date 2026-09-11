import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('T-REX Capital Market'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
  VITE_API_BASE_URL: z.string().url().default('http://192.168.29.90:3000/api'),
  VITE_API_VERSION: z.string().default('v1'),
  VITE_SOCKET_URL: z.string().default('ws://192.168.29.90:3000/ws'),
  VITE_REQUEST_TIMEOUT: z.coerce.number().positive().default(500000),
  VITE_USE_MOCK_API: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_DARK_MODE: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_ANALYTICS: z.enum(['true', 'false']).default('false'),
  VITE_FIREBASE_API_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().default(''),
  VITE_WALLETCONNECT_PROJECT_ID: z.string().default(''),
  VITE_WEB3_DEFAULT_CHAIN: z.literal('sepolia').default('sepolia'),
  VITE_WEB3_ENABLED_CHAINS: z.literal('sepolia').default('sepolia'),
  VITE_SEPOLIA_RPC_URL: z.string().url().default('https://ethereum-sepolia-rpc.publicnode.com'),
  VITE_TREX_GATEWAY_ADDRESS: z.string().default('0x32c06Dcd426ee86c4FDD2514c58785ff7A5DDAc0'),
  VITE_TREX_PLATFORM_WALLET_ADDRESS: z.string().default('0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859'),
  VITE_ONCHAIN_ID_FACTORY_ADDRESS: z.string().default('0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15'),
  VITE_COUNTRY_RESTRICT_MODULE_ADDRESS: z.string().default('0xF5D3F29B57f2fd33aDbF5d6A5F5C774C07D18fDf'),
  VITE_MAX_BALANCE_MODULE_ADDRESS: z.string().default('0x45747f7068CE9C743b82ec3E8E92627b495860A6'),
  VITE_MAX_INVESTORS_MODULE_ADDRESS: z.string().default('0xa729d37329Bc0F513d5E50d200ec9cf06a80064F'),
});

const result = envSchema.safeParse(import.meta.env);

if (!result.success) {
  console.error('Invalid environment configuration', result.error.flatten().fieldErrors);
  throw new Error('Application environment is invalid. Check your .env file.');
}

const parsed = result.data;

export const env = Object.freeze({
  appName: parsed.VITE_APP_NAME,
  appVersion: parsed.VITE_APP_VERSION,
  apiBaseUrl: parsed.VITE_API_BASE_URL.replace(/\/$/, ''),
  apiVersion: parsed.VITE_API_VERSION.replace(/^\/+|\/+$/g, ''),
  socketUrl: parsed.VITE_SOCKET_URL,
  requestTimeout: parsed.VITE_REQUEST_TIMEOUT,
  firebaseApiKey: parsed.VITE_FIREBASE_API_KEY,
  sentryDsn: parsed.VITE_SENTRY_DSN,
  walletConnectProjectId: parsed.VITE_WALLETCONNECT_PROJECT_ID.trim(),
  web3: {
    defaultChain: parsed.VITE_WEB3_DEFAULT_CHAIN,
    enabledChains: [parsed.VITE_WEB3_ENABLED_CHAINS],
    rpcUrl: parsed.VITE_SEPOLIA_RPC_URL,
  },
  trex: {
    gateway: parsed.VITE_TREX_GATEWAY_ADDRESS,
    platformWallet: parsed.VITE_TREX_PLATFORM_WALLET_ADDRESS,
    identityFactory: parsed.VITE_ONCHAIN_ID_FACTORY_ADDRESS,
    complianceModules: {
      countryRestrict: parsed.VITE_COUNTRY_RESTRICT_MODULE_ADDRESS,
      maxBalance: parsed.VITE_MAX_BALANCE_MODULE_ADDRESS,
      maxInvestors: parsed.VITE_MAX_INVESTORS_MODULE_ADDRESS,
    },
  },
  features: {
    mockApi: parsed.VITE_USE_MOCK_API === 'true',
    darkMode: parsed.VITE_ENABLE_DARK_MODE === 'true',
    analytics: parsed.VITE_ENABLE_ANALYTICS === 'true',
  },
});
