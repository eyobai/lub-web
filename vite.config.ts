import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Adds a Content-Security-Policy to the built page. Sign-in tokens are kept in browser storage, so the page must
 * never run a script it did not ship with. Not applied by the dev server, whose hot reload needs inline scripts.
 * `frame-ancestors` cannot be set from a meta tag: the web server must send `X-Frame-Options: DENY`.
 */
function contentSecurityPolicy(apiBaseUrl: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' https: data:",
    // "/" means the API is served from the site's own address.
    apiBaseUrl.startsWith('/') ? "connect-src 'self'" : `connect-src 'self' ${new URL(apiBaseUrl).origin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // With VITE_API_BASE_URL=/ the local servers pass /api on to the backend, as a reverse proxy would in production.
  // PREVIEW_ANY_HOST=1 lets `npm run preview` answer under a tunnel's host name; never needed in production.
  const proxy = process.env.API_PROXY_TARGET ? { '/api': process.env.API_PROXY_TARGET } : undefined;
  return {
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(env.VITE_API_BASE_URL || 'http://localhost:3000'),
    ],
    build: {
      rolldownOptions: {
        output: {
          // Libraries change far less often than the site, so returning visitors keep them cached across releases.
          advancedChunks: { groups: [{ name: 'vendor', test: /node_modules/ }] },
        },
      },
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: {
      port: 5173,
      strictPort: true,
      proxy,
      allowedHosts: process.env.PREVIEW_ANY_HOST ? true : undefined,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
