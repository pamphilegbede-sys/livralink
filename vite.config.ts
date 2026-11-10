import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import fs from 'fs';

const currentBuildTime = new Date().toISOString();
const currentVersion = `2.4.${Date.now()}`;

function versionGeneratorPlugin() {
  const versionData = {
    version: currentVersion,
    buildTime: currentBuildTime,
    appName: 'LivraLink',
  };

  return {
    name: 'livralink-version-generator',
    buildStart() {
      try {
        const publicDir = path.resolve(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(
          path.resolve(publicDir, 'version.json'),
          JSON.stringify(versionData, null, 2),
          'utf8'
        );
      } catch (err) {
        console.warn('[Vite Version Plugin] Notice:', err);
      }
    },
    closeBundle() {
      try {
        const distDir = path.resolve(process.cwd(), 'dist');
        if (fs.existsSync(distDir)) {
          fs.writeFileSync(
            path.resolve(distDir, 'version.json'),
            JSON.stringify(versionData, null, 2),
            'utf8'
          );
        }
      } catch (err) {
        console.warn('[Vite Version Plugin closeBundle] Notice:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    define: {
      __APP_VERSION__: JSON.stringify(currentVersion),
      __APP_BUILD_TIME__: JSON.stringify(currentBuildTime),
    },
    plugins: [
      react(),
      tailwindcss(),
      versionGeneratorPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'sw-push.js'],
        manifest: {
          id: '/',
          name: 'LivraLink - Logistique Urbaine Connectée',
          short_name: 'LivraLink',
          description: 'Plateforme logistique urbaine connectée pour les vendeurs social-commerce et coursiers.',
          theme_color: '#1d4ed8',
          background_color: '#faf8ff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/version.json'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          importScripts: ['/sw-push.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/healthz/, /^\/version\.json/],
          runtimeCaching: [
            {
              // Do NOT cache API calls
              urlPattern: /^https?:\/\/.*\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              // Do NOT cache version metadata
              urlPattern: /^https?:\/\/.*\/version\.json.*/i,
              handler: 'NetworkOnly',
            },
            {
              // Cache Google Fonts
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache Gstatic Fonts
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/@vis.gl/react-google-maps')) {
              return 'vendor-maps';
            }
            if (id.includes('node_modules/lucide-react') || id.includes('node_modules/motion')) {
              return 'vendor-ui';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: false,
      // @ts-ignore - allowedHosts supported in modern Vite
      allowedHosts: true,
      // HMR is disabled in AI Studio environment
      hmr: false,
      ws: false,
    },
  };
});

