import { z } from 'zod';

export const DEFAULT_REQUEST_TIMEOUT_MS = 500_000;

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('T-REX Capital Market'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
  VITE_DEPLOYMENT_ENVIRONMENT: z.enum(['testnet', 'mainnet']).default('testnet'),
  VITE_COMPANY_NAME: z.string().default('T-REX Capital Market'),
  VITE_COMPANY_WEBSITE_URL: z.string().url().default('https://unblocktechnolabs.com/'),
  VITE_COMPANY_WEBSITE_LABEL: z.string().default('UNBLOCK TECHNOLABS'),
  VITE_CONTACT_US_URL: z.string().url().default('https://unblocktechnolabs.com/contactUs'),
  VITE_DOCUMENTS_URL: z.string().url().default('https://t-rex-capital.gitbook.io/docs/'),
  VITE_SUPPORT_EMAIL: z.string().email().default('support@trexcapitalmarket.dev'),
  VITE_API_BASE_URL: z.string().url().default('http://192.168.29.90:3000/api'),
  VITE_API_VERSION: z.string().default('v1'),
  VITE_SOCKET_URL: z.string().default('ws://192.168.29.90:3000/ws'),
  VITE_REQUEST_TIMEOUT: z.coerce.number().positive().default(DEFAULT_REQUEST_TIMEOUT_MS),
  VITE_USE_MOCK_API: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_DARK_MODE: z.enum(['true', 'false']).default('false'),
  VITE_ENABLE_ANALYTICS: z.enum(['true', 'false']).default('false'),
  VITE_FIREBASE_API_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().default(''),
  VITE_WALLETCONNECT_PROJECT_ID: z.string().default(''),
  VITE_BRIDGE_ETHEREUM_RPC_URL: z.union([z.literal(''), z.string().url()]).default(''),
  VITE_BRIDGE_ETHEREUM_EXPLORER_URL: z.union([z.literal(''), z.string().url()]).default(''),
  VITE_BRIDGE_ETHEREUM_USDC_ADDRESS: z.union([z.literal(''), z.string().regex(/^0x[a-fA-F0-9]{40}$/)]).default(''),
});

const result = envSchema.safeParse(import.meta.env);
if (!result.success) {
  console.error('Invalid environment configuration', result.error.flatten().fieldErrors);
  throw new Error('Application environment is invalid. Check your .env file.');
}
const parsed = result.data;

const ethereumBridgeDefaults = parsed.VITE_DEPLOYMENT_ENVIRONMENT === 'mainnet'
  ? {
      rpcUrl: 'https://ethereum-rpc.publicnode.com',
      explorerUrl: 'https://etherscan.io',
      usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    }
  : {
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
      explorerUrl: 'https://sepolia.etherscan.io',
      usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    };

export const env = Object.freeze({
  appName: parsed.VITE_APP_NAME,
  appVersion: parsed.VITE_APP_VERSION,
  deploymentEnvironment: parsed.VITE_DEPLOYMENT_ENVIRONMENT,
  companyName: parsed.VITE_COMPANY_NAME,
  companyWebsiteUrl: parsed.VITE_COMPANY_WEBSITE_URL,
  companyWebsiteLabel: parsed.VITE_COMPANY_WEBSITE_LABEL,
  contactUsUrl: parsed.VITE_CONTACT_US_URL,
  documentsUrl: parsed.VITE_DOCUMENTS_URL,
  supportEmail: parsed.VITE_SUPPORT_EMAIL,
  apiBaseUrl: parsed.VITE_API_BASE_URL.replace(/\/$/, ''),
  apiVersion: parsed.VITE_API_VERSION.replace(/^\/+|\/+$/g, ''),
  socketUrl: parsed.VITE_SOCKET_URL,
  requestTimeout: parsed.VITE_REQUEST_TIMEOUT,
  firebaseApiKey: parsed.VITE_FIREBASE_API_KEY,
  sentryDsn: parsed.VITE_SENTRY_DSN,
  walletConnectProjectId: parsed.VITE_WALLETCONNECT_PROJECT_ID.trim(),
  bridgeEthereum: Object.freeze({
    rpcUrl: parsed.VITE_BRIDGE_ETHEREUM_RPC_URL.trim() || ethereumBridgeDefaults.rpcUrl,
    explorerUrl: parsed.VITE_BRIDGE_ETHEREUM_EXPLORER_URL.trim() || ethereumBridgeDefaults.explorerUrl,
    usdcAddress: parsed.VITE_BRIDGE_ETHEREUM_USDC_ADDRESS.trim() || ethereumBridgeDefaults.usdcAddress,
  }),
  features: {
    mockApi: parsed.VITE_USE_MOCK_API === 'true',
    darkMode: parsed.VITE_ENABLE_DARK_MODE === 'true',
    analytics: parsed.VITE_ENABLE_ANALYTICS === 'true',
  },
});
