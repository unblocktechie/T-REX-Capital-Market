import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const sourceRoot = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), sourceRoot)
      : specifier.startsWith('.') && context.parentURL?.startsWith(sourceRoot.href)
        ? new URL(specifier, context.parentURL)
        : null;
    if (url?.protocol === 'file:') {
      for (const suffix of ['', '.js', '/index.js']) {
        const candidate = new URL(url.href + suffix);
        if (existsSync(fileURLToPath(candidate)) && /\.m?js$/.test(candidate.pathname)) {
          return nextResolve(candidate.href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
