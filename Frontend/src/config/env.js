import { z } from 'zod';

// Default Platform Controller that must be registered as a Token Agent on every
// newly created T-REX token. It remains environment-overridable for controlled
// network migrations, while this Arc Testnet address is the default for the current platform.
export const DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS =
  '0x972E9CEf9eA9d3A9d7f3261bb8e16bA59E76a0FB';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('T-REX Capital Market'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
  // VITE_API_BASE_URL: z.string().url().default('https://trex-api.farmlink.site/api'),
  VITE_API_BASE_URL: z.string().url().default('http://192.168.29.90:3000/api'),
  VITE_API_VERSION: z.string().default('v1'),
  VITE_SOCKET_URL: z.string().default('ws://192.168.29.90:3000/ws'),
  VITE_REQUEST_TIMEOUT: z.coerce.number().positive().default(500000),
  VITE_USE_MOCK_API: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_DARK_MODE: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_ANALYTICS: z.enum(['true', 'false']).default('false'),
  VITE_FIREBASE_API_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().default(''),
  VITE_PRIVY_APP_ID: z.string().min(1).default('your-privy-app-id'),
  VITE_PRIVY_CLIENT_ID: z.string().default(''),
  VITE_WEB3_DEFAULT_CHAIN: z.literal('arc-testnet').default('arc-testnet'),
  VITE_WEB3_ENABLED_CHAINS: z.literal('arc-testnet').default('arc-testnet'),
  VITE_ARC_TESTNET_RPC_URL: z.string().url().default('https://rpc.testnet.arc.network'),
  VITE_TREX_GATEWAY_ADDRESS: z.string().default('0x9b0077e6000C9937eE769A61519F9CdFc3f30331'),
  VITE_TREX_PLATFORM_WALLET_ADDRESS: z.string().default('0x849F887daec1B14c161ec377C95549ef83dDf3ff'),
  VITE_TREX_PLATFORM_CONTROLLER_ADDRESS: z.string().default(DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS),
  VITE_TREX_PAYMENT_TOKEN_ADDRESS: z.string().default('0x3600000000000000000000000000000000000000'),
  VITE_ONCHAIN_ID_FACTORY_ADDRESS: z.string().default('0xA30A9FC6d6ea2Fa3fa3F01265a3C1253125481D8'),
  VITE_COUNTRY_RESTRICT_MODULE_ADDRESS: z.string().default('0x7f3a67C7b520a0F01d7A3d98A5B7F2a3bfc7A54D'),
  VITE_MAX_BALANCE_MODULE_ADDRESS: z.string().default('0x08B942c8aCFdB143F0096Cc4D80160221B589804'),
  VITE_MAX_INVESTORS_MODULE_ADDRESS: z.string().default('0xa893BFEE2eCd38A61De91D74Ec15427dA6f7890f'),
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
  privy: {
    appId: parsed.VITE_PRIVY_APP_ID.trim(),
    clientId: parsed.VITE_PRIVY_CLIENT_ID.trim(),
  },
  web3: {
    defaultChain: parsed.VITE_WEB3_DEFAULT_CHAIN,
    enabledChains: [parsed.VITE_WEB3_ENABLED_CHAINS],
    rpcUrl: parsed.VITE_ARC_TESTNET_RPC_URL,
  },
  trex: {
    gateway: parsed.VITE_TREX_GATEWAY_ADDRESS,
    platformWallet: parsed.VITE_TREX_PLATFORM_WALLET_ADDRESS,
    platformController: parsed.VITE_TREX_PLATFORM_CONTROLLER_ADDRESS,
    paymentToken: parsed.VITE_TREX_PAYMENT_TOKEN_ADDRESS,
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
