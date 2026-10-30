import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const FRONTEND_PROFILE_MODES = new Set(['testnet', 'mainnet']);

const assertFrontendProfileMatchesMode = (mode, env) => {
  if (!FRONTEND_PROFILE_MODES.has(mode)) return;

  const profile = String(env.VITE_DEPLOYMENT_ENVIRONMENT || '').trim().toLowerCase();
  if (profile !== mode) {
    throw new Error(
      `${mode} build aborted: VITE_DEPLOYMENT_ENVIRONMENT must be "${mode}" in .env.${mode}.`,
    );
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  assertFrontendProfileMatchesMode(mode, env);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
    server: {
      host: true,
      port: Number(env.VITE_DEV_PORT || 5173),
      open: true,
    },
    preview: {
      host: true,
      port: Number(env.VITE_PREVIEW_PORT || 4173),
    },
    build: {
      sourcemap: env.VITE_ENABLE_SOURCEMAPS === 'true',
      target: 'es2022',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 850,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (
              id.includes('/react-hook-form/') ||
              id.includes('/@hookform/resolvers/') ||
              id.includes('/zod/')
            )
              return 'forms';
            if (id.includes('/@tanstack/react-query/') || id.includes('/axios/')) return 'query';
            if (
              id.includes('/framer-motion/') ||
              id.includes('/lucide-react/') ||
              id.includes('/sonner/')
            )
              return 'ui';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/scheduler/')
            )
              return 'react';
            return 'vendor';
          },
        },
      },
    },
  };
});
