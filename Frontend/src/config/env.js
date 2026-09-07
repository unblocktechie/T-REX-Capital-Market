import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('T-REX Capital Market'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
  VITE_API_BASE_URL: z.string().url().default('http://192.168.29.90:3000/api'),
  VITE_API_VERSION: z.string().default('v1'),
  VITE_SOCKET_URL: z.string().default('ws://192.168.29.90:3000/ws'),
  VITE_REQUEST_TIMEOUT: z.coerce.number().positive().default(15000),
  VITE_USE_MOCK_API: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_DARK_MODE: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_ANALYTICS: z.enum(['true', 'false']).default('false'),
  VITE_FIREBASE_API_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().default(''),
  VITE_WALLETCONNECT_PROJECT_ID: z.string().default(''),
  VITE_WEB3_DEFAULT_CHAIN: z.literal('sepolia').default('sepolia'),
  VITE_WEB3_ENABLED_CHAINS: z.literal('sepolia').default('sepolia'),
  VITE_SEPOLIA_RPC_URL: z.string().url().default('https://ethereum-sepolia-rpc.publicnode.com'),
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
  features: {
    mockApi: parsed.VITE_USE_MOCK_API === 'true',
    darkMode: parsed.VITE_ENABLE_DARK_MODE === 'true',
    analytics: parsed.VITE_ENABLE_ANALYTICS === 'true',
  },
});
