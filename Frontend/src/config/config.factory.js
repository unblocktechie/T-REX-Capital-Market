import { z } from 'zod';

const booleanString = z.enum(['true', 'false']);
const positiveInteger = z.coerce.number().int().positive();
const nonNegativeInteger = z.coerce.number().int().nonnegative();
const positiveNumber = z.coerce.number().positive();
const optionalUrl = z.union([z.literal(''), z.string().url()]);
const evmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Expected a valid EVM address');
const optionalAddress = z.union([z.literal(''), evmAddress]);

// Backward-compatible fixed fallback used by the token deployment flow.
// Environment configuration may override the active controller, but this constant
// remains the legacy default value just like the previous env.js implementation.
export const DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS =
  '0x972E9CEf9eA9d3A9d7f3261bb8e16bA59E76a0FB';

// Environment variables always take precedence. These schema defaults preserve the
// legacy/local behavior when a VITE_* key is omitted. Keep the defaults aligned with
// the default `.env` profile. Mainnet builds are still protected by mode/network guards
// in `vite.config.js`, so production cannot silently become a Testnet build.
const envSchema = z.object({
  // Application
  VITE_APP_NAME: z.string().min(1).default('T-REX Capital Market'),
  VITE_APP_VERSION: z.string().min(1).default('1.0.0'),
  VITE_APP_DEFAULT_LOCALE: z.string().min(1).default('en-IN'),
  VITE_APP_DEFAULT_CURRENCY: z.string().min(1).default('USD'),
  VITE_APP_DEFAULT_PAGE_SIZE: positiveInteger.default(10),

  // Branding / UI
  VITE_COMPANY_NAME: z.string().min(1).default('T-REX Capital Market'),
  VITE_SHORT_PRODUCT_NAME: z.string().min(1).default('T-REX'),
  VITE_BRAND_SUBTITLE: z.string().min(1).default('Capital Market'),
  VITE_SUPPORT_EMAIL: z.string().email().default('support@trexcapitalmarket.dev'),
  VITE_COMPLIANCE_EMAIL: z.string().email().default('compliance@erc3643.com'),
  VITE_COMPANY_WEBSITE_URL: z.string().url().default('https://unblocktechnolabs.com/'),
  VITE_COMPANY_WEBSITE_LABEL: z.string().min(1).default('Unblock Technolabs'),
  VITE_META_DESCRIPTION: z.string().min(1).default('T-REX Capital Market for compliant digital securities, identity verification and token lifecycle management'),
  VITE_BROWSER_THEME_COLOR: z.string().min(1).default('#d5d9dd'),
  VITE_FAVICON_PATH: z.string().min(1).default('/favicon.ico'),
  VITE_FAVICON_32_PATH: z.string().min(1).default('/favicon-32.png'),
  VITE_APPLE_TOUCH_ICON_PATH: z.string().min(1).default('/apple-touch-icon.png'),

  // Vite/build
  VITE_DEV_PORT: positiveInteger.default(5173),
  VITE_DEV_HOST: z.string().min(1).default('true'),
  VITE_DEV_OPEN_BROWSER: booleanString.default('true'),
  VITE_DEV_ALLOWED_HOSTS: z.string().default('gullible-borrower-recreate.ngrok-free.dev'),
  VITE_PREVIEW_PORT: positiveInteger.default(4173),
  VITE_PREVIEW_HOST: z.string().min(1).default('true'),
  VITE_ENABLE_SOURCEMAPS: booleanString.default('false'),
  VITE_BUILD_TARGET: z.string().min(1).default('es2022'),
  VITE_ENABLE_CSS_CODE_SPLITTING: booleanString.default('true'),
  VITE_CHUNK_SIZE_WARNING_LIMIT_KB: positiveInteger.default(850),

  // API / browser integrations
  VITE_API_BASE_URL: z.string().url().default('https://trex-api.unblocktechnolabs.com/api'),
  VITE_API_VERSION: z.string().min(1).default('v1'),
  VITE_SOCKET_URL: z.string().min(1).default('ws://192.168.29.90:3000/ws'),
  VITE_REQUEST_TIMEOUT: positiveNumber.default(500000),
  VITE_FIREBASE_API_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().default(''),

  // Authentication
  VITE_PRIVY_APP_ID: z.string().min(1).default('cmtqzuudp01340cl7inmrtbj8'),
  VITE_PRIVY_CLIENT_ID: z.string().default(''),

  // Feature flags
  VITE_USE_MOCK_API: booleanString.default('false'),
  VITE_ENABLE_DARK_MODE: booleanString.default('false'),
  VITE_ENABLE_ANALYTICS: booleanString.default('false'),
  VITE_ENABLE_USER_MANAGEMENT: booleanString.default('true'),
  VITE_ENABLE_AUDIT_TRAIL: booleanString.default('false'),
  VITE_ENABLE_CONTACT_SUPPORT_ACTIONS: booleanString.default('false'),
  VITE_ENABLE_MAINNET_LAUNCH_BANNER: booleanString.default('false'),

  // Sign-in mainnet launch announcement
  VITE_MAINNET_LAUNCH_BANNER_MESSAGE: z.string().min(1).default('T-REX Capital Market is now live on Mainnet.'),
  VITE_MAINNET_LAUNCH_BANNER_CTA: z.string().min(1).default('Read the announcement'),
  VITE_MAINNET_LAUNCH_BANNER_URL: optionalUrl.default(''),

  // Arc transaction network
  VITE_ARC_NETWORK_KEY: z.string().min(1).default('arc'),
  VITE_ARC_CHAIN_ID: positiveInteger.default(5042002),
  VITE_ARC_NETWORK_NAME: z.string().min(1).default('Arc'),
  VITE_ARC_NETWORK_SHORT_NAME: z.string().min(1).default('Arc'),
  VITE_ARC_RPC_URL: z.string().url().default('https://rpc.testnet.arc.network'),
  VITE_ARC_RPC_WS_URL: optionalUrl.default('wss://rpc.testnet.arc.network'),
  VITE_ARC_EXPLORER_NAME: z.string().min(1).default('ArcScan'),
  VITE_ARC_EXPLORER_URL: z.string().url().default('https://testnet.arcscan.app'),
  VITE_ARC_NETWORK_ICON_URL: optionalUrl.default('https://testnet.arcscan.app/assets/configs/network_icon.svg'),
  VITE_ARC_IS_TESTNET: booleanString.default('true'),
  VITE_ARC_ENVIRONMENT_LABEL: z.string().min(1).default('Testnet'),
  VITE_ARC_NATIVE_CURRENCY_NAME: z.string().min(1).default('USD Coin'),
  VITE_ARC_NATIVE_CURRENCY_SYMBOL: z.string().min(1).default('USDC'),
  VITE_ARC_NATIVE_CURRENCY_DECIMALS: nonNegativeInteger.default(18),
  VITE_REQUIRED_TRANSACTION_CONFIRMATIONS: positiveInteger.default(1),

  // Secondary wallet/bridge network
  VITE_WALLET_VIEW_NETWORK_KEY: z.string().min(1).default('ethereum-sepolia'),
  VITE_WALLET_VIEW_CHAIN_ID: positiveInteger.default(11155111),
  VITE_WALLET_VIEW_NETWORK_NAME: z.string().min(1).default('Ethereum Sepolia'),
  VITE_WALLET_VIEW_NETWORK_SHORT_NAME: z.string().min(1).default('Sepolia'),
  VITE_WALLET_VIEW_IS_TESTNET: booleanString.default('true'),
  VITE_WALLET_VIEW_NATIVE_CURRENCY_NAME: z.string().min(1).default('Sepolia Ether'),
  VITE_WALLET_VIEW_NATIVE_CURRENCY_SYMBOL: z.string().min(1).default('ETH'),
  VITE_WALLET_VIEW_NATIVE_CURRENCY_DECIMALS: nonNegativeInteger.default(18),
  VITE_WALLET_VIEW_RPC_URL: z.string().url().default('https://11155111.rpc.thirdweb.com'),
  VITE_WALLET_VIEW_EXPLORER_NAME: z.string().min(1).default('Etherscan'),
  VITE_WALLET_VIEW_EXPLORER_URL: z.string().url().default('https://sepolia.etherscan.io'),
  VITE_WALLET_VIEW_EXPLORER_API_URL: optionalUrl.default('https://api-sepolia.etherscan.io/api'),
  VITE_WALLET_VIEW_MULTICALL3_ADDRESS: optionalAddress.default('0xca11bde05977b3631167028862be2a173976ca11'),
  VITE_WALLET_VIEW_MULTICALL3_BLOCK_CREATED: nonNegativeInteger.default(751532),
  VITE_WALLET_VIEW_ENS_RESOLVER_ADDRESS: optionalAddress.default('0xeeeeeeee14d718c2b47d9923deab1335e144eeee'),
  VITE_WALLET_VIEW_ENS_RESOLVER_BLOCK_CREATED: nonNegativeInteger.default(8928790),

  // Wallet-view USDC asset
  VITE_WALLET_VIEW_USDC_ID: z.string().min(1).default('ethereum-sepolia-usdc'),
  VITE_WALLET_VIEW_USDC_KIND: z.string().min(1).default('network-token'),
  VITE_WALLET_VIEW_USDC_NAME: z.string().min(1).default('USD Coin'),
  VITE_WALLET_VIEW_USDC_SYMBOL: z.string().min(1).default('USDC'),
  VITE_WALLET_VIEW_USDC_ADDRESS: evmAddress.default('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
  VITE_WALLET_VIEW_USDC_DECIMALS: nonNegativeInteger.default(6),

  // Circle bridge
  VITE_BRIDGE_ENVIRONMENT: z.string().min(1).default('testnet'),
  VITE_BRIDGE_TOKEN: z.string().min(1).default('USDC'),
  VITE_BRIDGE_TRANSFER_SPEED: z.string().min(1).default('FAST'),
  VITE_BRIDGE_MAX_FEE: z.string().default(''),
  VITE_BRIDGE_FALLBACK_SOURCE_GAS_UNITS: positiveInteger.default(500000),
  VITE_BRIDGE_FALLBACK_DESTINATION_GAS_UNITS: positiveInteger.default(500000),
  VITE_BRIDGE_SOURCE_APP_KIT_CHAIN: z.string().min(1).default('Ethereum_Sepolia'),
  VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN: z.string().min(1).default('Arc_Testnet'),
  VITE_BRIDGE_TO_ARC_LABEL: z.string().min(1).default('Bridge to Arc'),
  VITE_BRIDGE_TO_WALLET_VIEW_LABEL: z.string().min(1).default('Bridge to Sepolia'),

  // T-REX / ONCHAINID deployment
  VITE_TREX_GATEWAY_ADDRESS: evmAddress.default('0x9b0077e6000C9937eE769A61519F9CdFc3f30331'),
  VITE_TREX_PLATFORM_WALLET_ADDRESS: evmAddress.default('0x849F887daec1B14c161ec377C95549ef83dDf3ff'),
  VITE_TREX_PLATFORM_CONTROLLER_ADDRESS: evmAddress.default(DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS),
  VITE_TREX_PAYMENT_TOKEN_ADDRESS: evmAddress.default('0x3600000000000000000000000000000000000000'),
  VITE_ONCHAIN_ID_FACTORY_ADDRESS: evmAddress.default('0xA30A9FC6d6ea2Fa3fa3F01265a3C1253125481D8'),
  VITE_COUNTRY_RESTRICT_MODULE_ADDRESS: evmAddress.default('0x7f3a67C7b520a0F01d7A3d98A5B7F2a3bfc7A54D'),
  VITE_MAX_BALANCE_MODULE_ADDRESS: evmAddress.default('0x08B942c8aCFdB143F0096Cc4D80160221B589804'),
  VITE_MAX_INVESTORS_MODULE_ADDRESS: evmAddress.default('0xa893BFEE2eCd38A61De91D74Ec15427dA6f7890f'),

  // Privy add-funds configuration
  VITE_WALLET_FUNDING_CHAIN: z.string().min(1).default('eip155:1'),
  VITE_WALLET_FUNDING_CHAIN_ID: positiveInteger.default(1),
  VITE_WALLET_FUNDING_NETWORK_NAME: z.string().min(1).default('Ethereum Mainnet'),
  VITE_WALLET_FUNDING_SYMBOL: z.string().min(1).default('USDC'),
  VITE_WALLET_FUNDING_ASSET_ADDRESS: evmAddress.default('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  VITE_WALLET_FUNDING_FIAT_ENVIRONMENT: z.string().min(1).default('production'),
  VITE_WALLET_FUNDING_CRYPTO_SLIPPAGE_BPS: nonNegativeInteger.default(100),

  // Deployment metadata
  VITE_DEPLOYMENT_CLIENT_IDENTIFIER: z.string().min(1).default('trex-capital-market-ui'),
});

const toBoolean = (value) => value === 'true';
const parseHost = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
const parseCsv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const freeze = (value) => Object.freeze(value);

export const parsePublicEnv = (source) => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = Object.entries(result.error.flatten().fieldErrors)
      .map(([key, errors]) => `${key}: ${errors.join(', ')}`)
      .join('\n');
    throw new Error(`Invalid public environment configuration:\n${details}`);
  }

  return result.data;
};

/**
 * Converts browser-safe VITE_* values into the existing centralized config
 * shape. Supplied environment values override the schema defaults; omitted keys
 * fall back to the legacy/local defaults so existing behavior remains compatible.
 */
export const createCentralizedConfig = (source) => {
  const env = parsePublicEnv(source);

  return freeze({
    application: freeze({
      name: env.VITE_APP_NAME,
      version: env.VITE_APP_VERSION,
      defaultLocale: env.VITE_APP_DEFAULT_LOCALE,
      defaultCurrency: env.VITE_APP_DEFAULT_CURRENCY,
      defaultPageSize: env.VITE_APP_DEFAULT_PAGE_SIZE,
    }),
    branding: freeze({
      companyName: env.VITE_COMPANY_NAME,
      shortProductName: env.VITE_SHORT_PRODUCT_NAME,
      brandSubtitle: env.VITE_BRAND_SUBTITLE,
      supportEmail: env.VITE_SUPPORT_EMAIL,
      complianceEmail: env.VITE_COMPLIANCE_EMAIL,
      companyWebsiteUrl: env.VITE_COMPANY_WEBSITE_URL,
      companyWebsiteLabel: env.VITE_COMPANY_WEBSITE_LABEL,
      metaDescription: env.VITE_META_DESCRIPTION,
      browserThemeColor: env.VITE_BROWSER_THEME_COLOR,
      faviconPath: env.VITE_FAVICON_PATH,
      favicon32Path: env.VITE_FAVICON_32_PATH,
      appleTouchIconPath: env.VITE_APPLE_TOUCH_ICON_PATH,
      mainnetLaunchBanner: freeze({
        message: env.VITE_MAINNET_LAUNCH_BANNER_MESSAGE,
        ctaLabel: env.VITE_MAINNET_LAUNCH_BANNER_CTA,
        url: env.VITE_MAINNET_LAUNCH_BANNER_URL,
      }),
    }),
    build: freeze({
      developmentServerPort: env.VITE_DEV_PORT,
      developmentServerHost: parseHost(env.VITE_DEV_HOST),
      openBrowserOnDevelopmentServerStart: toBoolean(env.VITE_DEV_OPEN_BROWSER),
      developmentServerAllowedHosts: freeze(parseCsv(env.VITE_DEV_ALLOWED_HOSTS)),
      previewServerPort: env.VITE_PREVIEW_PORT,
      previewServerHost: parseHost(env.VITE_PREVIEW_HOST),
      enableSourceMaps: toBoolean(env.VITE_ENABLE_SOURCEMAPS),
      javascriptTarget: env.VITE_BUILD_TARGET,
      enableCssCodeSplitting: toBoolean(env.VITE_ENABLE_CSS_CODE_SPLITTING),
      chunkSizeWarningLimitKb: env.VITE_CHUNK_SIZE_WARNING_LIMIT_KB,
    }),
    api: freeze({
      baseUrl: env.VITE_API_BASE_URL,
      version: env.VITE_API_VERSION,
      socketUrl: env.VITE_SOCKET_URL,
      requestTimeoutMs: env.VITE_REQUEST_TIMEOUT,
    }),
    authentication: freeze({
      privy: freeze({
        appId: env.VITE_PRIVY_APP_ID,
        clientId: env.VITE_PRIVY_CLIENT_ID,
      }),
    }),
    features: freeze({
      useMockApi: toBoolean(env.VITE_USE_MOCK_API),
      enableDarkMode: toBoolean(env.VITE_ENABLE_DARK_MODE),
      enableAnalytics: toBoolean(env.VITE_ENABLE_ANALYTICS),
      enableUserManagement: toBoolean(env.VITE_ENABLE_USER_MANAGEMENT),
      enableAuditTrail: toBoolean(env.VITE_ENABLE_AUDIT_TRAIL),
      enableContactSupportActions: toBoolean(env.VITE_ENABLE_CONTACT_SUPPORT_ACTIONS),
      enableMainnetLaunchBanner: toBoolean(env.VITE_ENABLE_MAINNET_LAUNCH_BANNER),
    }),
    clientIntegrations: freeze({
      firebaseApiKey: env.VITE_FIREBASE_API_KEY,
      sentryDsn: env.VITE_SENTRY_DSN,
    }),
    blockchain: freeze({
      requiredChain: freeze({
        key: env.VITE_ARC_NETWORK_KEY,
        chainId: env.VITE_ARC_CHAIN_ID,
        displayName: env.VITE_ARC_NETWORK_NAME,
        shortDisplayName: env.VITE_ARC_NETWORK_SHORT_NAME,
        isTestnet: toBoolean(env.VITE_ARC_IS_TESTNET),
        environmentBadgeLabel: env.VITE_ARC_ENVIRONMENT_LABEL,
        nativeCurrencyName: env.VITE_ARC_NATIVE_CURRENCY_NAME,
        nativeCurrencySymbol: env.VITE_ARC_NATIVE_CURRENCY_SYMBOL,
        nativeCurrencyDecimals: env.VITE_ARC_NATIVE_CURRENCY_DECIMALS,
        rpcHttpUrl: env.VITE_ARC_RPC_URL,
        rpcWebSocketUrl: env.VITE_ARC_RPC_WS_URL,
        explorerName: env.VITE_ARC_EXPLORER_NAME,
        explorerUrl: env.VITE_ARC_EXPLORER_URL,
        networkIconUrl: env.VITE_ARC_NETWORK_ICON_URL,
      }),
      walletViewChain: freeze({
        key: env.VITE_WALLET_VIEW_NETWORK_KEY,
        chainId: env.VITE_WALLET_VIEW_CHAIN_ID,
        displayName: env.VITE_WALLET_VIEW_NETWORK_NAME,
        shortDisplayName: env.VITE_WALLET_VIEW_NETWORK_SHORT_NAME,
        isTestnet: toBoolean(env.VITE_WALLET_VIEW_IS_TESTNET),
        nativeCurrencyName: env.VITE_WALLET_VIEW_NATIVE_CURRENCY_NAME,
        nativeCurrencySymbol: env.VITE_WALLET_VIEW_NATIVE_CURRENCY_SYMBOL,
        nativeCurrencyDecimals: env.VITE_WALLET_VIEW_NATIVE_CURRENCY_DECIMALS,
        rpcHttpUrl: env.VITE_WALLET_VIEW_RPC_URL,
        explorerName: env.VITE_WALLET_VIEW_EXPLORER_NAME,
        explorerUrl: env.VITE_WALLET_VIEW_EXPLORER_URL,
        explorerApiUrl: env.VITE_WALLET_VIEW_EXPLORER_API_URL,
        multicall3Address: env.VITE_WALLET_VIEW_MULTICALL3_ADDRESS,
        multicall3BlockCreated: env.VITE_WALLET_VIEW_MULTICALL3_BLOCK_CREATED,
        ensUniversalResolverAddress: env.VITE_WALLET_VIEW_ENS_RESOLVER_ADDRESS,
        ensUniversalResolverBlockCreated: env.VITE_WALLET_VIEW_ENS_RESOLVER_BLOCK_CREATED,
      }),
      requiredTransactionConfirmations: env.VITE_REQUIRED_TRANSACTION_CONFIRMATIONS,
    }),
    contracts: freeze({
      trexGatewayAddress: env.VITE_TREX_GATEWAY_ADDRESS,
      trexPlatformWalletAddress: env.VITE_TREX_PLATFORM_WALLET_ADDRESS,
      trexPlatformControllerAddress: env.VITE_TREX_PLATFORM_CONTROLLER_ADDRESS,
      trexPaymentTokenAddress: env.VITE_TREX_PAYMENT_TOKEN_ADDRESS,
      onchainIdFactoryAddress: env.VITE_ONCHAIN_ID_FACTORY_ADDRESS,
      countryRestrictModuleAddress: env.VITE_COUNTRY_RESTRICT_MODULE_ADDRESS,
      maxBalanceModuleAddress: env.VITE_MAX_BALANCE_MODULE_ADDRESS,
      maxInvestorsModuleAddress: env.VITE_MAX_INVESTORS_MODULE_ADDRESS,
    }),
    tokens: freeze({
      walletViewUsdc: freeze({
        id: env.VITE_WALLET_VIEW_USDC_ID,
        kind: env.VITE_WALLET_VIEW_USDC_KIND,
        name: env.VITE_WALLET_VIEW_USDC_NAME,
        symbol: env.VITE_WALLET_VIEW_USDC_SYMBOL,
        address: env.VITE_WALLET_VIEW_USDC_ADDRESS,
        decimals: env.VITE_WALLET_VIEW_USDC_DECIMALS,
      }),
    }),
    bridge: freeze({
      environment: env.VITE_BRIDGE_ENVIRONMENT,
      token: env.VITE_BRIDGE_TOKEN,
      transferSpeed: env.VITE_BRIDGE_TRANSFER_SPEED,
      maxFee: env.VITE_BRIDGE_MAX_FEE,
      fallbackSourceGasUnits: env.VITE_BRIDGE_FALLBACK_SOURCE_GAS_UNITS,
      fallbackDestinationGasUnits: env.VITE_BRIDGE_FALLBACK_DESTINATION_GAS_UNITS,
      sourceAppKitChain: env.VITE_BRIDGE_SOURCE_APP_KIT_CHAIN,
      destinationAppKitChain: env.VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN,
      toRequiredChainLabel: env.VITE_BRIDGE_TO_ARC_LABEL,
      toWalletViewChainLabel: env.VITE_BRIDGE_TO_WALLET_VIEW_LABEL,
    }),
    walletFunding: freeze({
      chain: env.VITE_WALLET_FUNDING_CHAIN,
      chainId: env.VITE_WALLET_FUNDING_CHAIN_ID,
      networkName: env.VITE_WALLET_FUNDING_NETWORK_NAME,
      symbol: env.VITE_WALLET_FUNDING_SYMBOL,
      assetAddress: env.VITE_WALLET_FUNDING_ASSET_ADDRESS,
      fiatEnvironment: env.VITE_WALLET_FUNDING_FIAT_ENVIRONMENT,
      cryptoSlippageBps: env.VITE_WALLET_FUNDING_CRYPTO_SLIPPAGE_BPS,
    }),
    deployment: freeze({
      clientIdentifier: env.VITE_DEPLOYMENT_CLIENT_IDENTIFIER,
    }),
  });
};
