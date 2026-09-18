import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createCentralizedConfig } from './src/config/config.factory.js';


const REQUIRED_MAINNET_OVERRIDE_KEYS = Object.freeze([
  'VITE_ARC_CHAIN_ID',
  'VITE_ARC_RPC_URL',
  'VITE_ARC_IS_TESTNET',
  'VITE_ARC_ENVIRONMENT_LABEL',
  'VITE_WALLET_VIEW_CHAIN_ID',
  'VITE_WALLET_VIEW_IS_TESTNET',
  'VITE_WALLET_VIEW_RPC_URL',
  'VITE_WALLET_VIEW_USDC_ADDRESS',
  'VITE_BRIDGE_ENVIRONMENT',
  'VITE_BRIDGE_SOURCE_APP_KIT_CHAIN',
  'VITE_BRIDGE_DESTINATION_APP_KIT_CHAIN',
  'VITE_BRIDGE_FALLBACK_SOURCE_GAS_UNITS',
  'VITE_BRIDGE_FALLBACK_DESTINATION_GAS_UNITS',
  'VITE_TREX_GATEWAY_ADDRESS',
  'VITE_TREX_PLATFORM_WALLET_ADDRESS',
  'VITE_TREX_PLATFORM_CONTROLLER_ADDRESS',
  'VITE_TREX_PAYMENT_TOKEN_ADDRESS',
  'VITE_ONCHAIN_ID_FACTORY_ADDRESS',
  'VITE_COUNTRY_RESTRICT_MODULE_ADDRESS',
  'VITE_MAX_BALANCE_MODULE_ADDRESS',
  'VITE_MAX_INVESTORS_MODULE_ADDRESS',
]);

const readModeOverrides = (mode) => {
  const filePath = resolve(process.cwd(), `.env.${mode}`);
  if (!existsSync(filePath)) return null;

  const values = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
};

const assertMainnetOverridesAreExplicit = (mode) => {
  if (mode !== 'mainnet') return;

  const overrides = readModeOverrides(mode);
  if (!overrides) {
    throw new Error(
      'Mainnet build aborted: .env.mainnet is required. Copy .env.mainnet.example to .env.mainnet and configure the production values.',
    );
  }

  const missing = REQUIRED_MAINNET_OVERRIDE_KEYS.filter((key) => {
    const value = overrides[key]?.trim();
    return !value || value.startsWith('REQUIRED_MAINNET_');
  });

  if (missing.length > 0) {
    throw new Error(
      `Mainnet build aborted: these network-critical values must be explicitly configured in .env.mainnet instead of using Testnet/default fallbacks:\n${missing.join('\n')}`,
    );
  }
};

const centralHtmlConfigPlugin = (htmlConfig) => ({
  name: 'central-html-config',
  transformIndexHtml(html) {
    return html
      .replaceAll('__APP_NAME__', htmlConfig.appName)
      .replaceAll('__APP_META_DESCRIPTION__', htmlConfig.metaDescription)
      .replaceAll('__APP_THEME_COLOR__', htmlConfig.themeColor)
      .replaceAll('__APP_FAVICON_PATH__', htmlConfig.faviconPath)
      .replaceAll('__APP_FAVICON_32_PATH__', htmlConfig.favicon32Path)
      .replaceAll('__APP_APPLE_TOUCH_ICON_PATH__', htmlConfig.appleTouchIconPath);
  },
});

const assertBuildModeMatchesNetwork = (mode, config) => {
  const isTestnet = config.blockchain.requiredChain.isTestnet;

  if (mode === 'testnet' && !isTestnet) {
    throw new Error(
      'Testnet build aborted: the active environment is configured as Mainnet. Check .env.testnet.',
    );
  }

  if (mode === 'mainnet' && isTestnet) {
    throw new Error(
      'Mainnet build aborted: no valid Mainnet profile is active. Copy .env.mainnet.example to .env.mainnet and configure the production addresses.',
    );
  }
};

export default defineConfig(({ mode }) => {
  assertMainnetOverridesAreExplicit(mode);

  const rawEnv = loadEnv(mode, process.cwd(), 'VITE_');
  const centralizedConfig = createCentralizedConfig(rawEnv);
  const { build, branding, application } = centralizedConfig;

  assertBuildModeMatchesNetwork(mode, centralizedConfig);

  return {
    plugins: [
      react(),
      tailwindcss(),
      centralHtmlConfigPlugin({
        appName: application.name,
        metaDescription: branding.metaDescription,
        themeColor: branding.browserThemeColor,
        faviconPath: branding.faviconPath,
        favicon32Path: branding.favicon32Path,
        appleTouchIconPath: branding.appleTouchIconPath,
      }),
    ],

    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },

    server: {
      host: build.developmentServerHost,
      port: build.developmentServerPort,
      open: build.openBrowserOnDevelopmentServerStart,
      // Vite mutates allowedHosts internally while resolving the dev-server config.
      // Keep centralizedConfig immutable, but pass Vite its own mutable copy.
      allowedHosts: [...build.developmentServerAllowedHosts],
    },

    preview: {
      host: build.previewServerHost,
      port: build.previewServerPort,
      // preview.allowedHosts defaults to server.allowedHosts in Vite. Use a separate
      // mutable copy so preview resolution never receives the frozen config array.
      allowedHosts: [...build.developmentServerAllowedHosts],
    },

    build: {
      sourcemap: build.enableSourceMaps,
      target: build.javascriptTarget,
      cssCodeSplit: build.enableCssCodeSplitting,
      chunkSizeWarningLimit: build.chunkSizeWarningLimitKb,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (
              id.includes('/react-hook-form/') ||
              id.includes('/@hookform/resolvers/') ||
              id.includes('/zod/')
            ) {
              return 'forms';
            }

            if (id.includes('/@tanstack/react-query/') || id.includes('/axios/')) {
              return 'query';
            }

            if (
              id.includes('/framer-motion/') ||
              id.includes('/lucide-react/') ||
              id.includes('/sonner/')
            ) {
              return 'ui';
            }

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react';
            }

            return 'vendor';
          },
        },
      },
    },
  };
});
