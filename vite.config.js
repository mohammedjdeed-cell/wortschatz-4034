import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "Wortschatz 4034",
        short_name: "Wortschatz",
        description: "10 German words a day from the frequency dictionary.",
        lang: "de",
        theme_color: "#18181b",
        background_color: "#f7f7f5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        importScripts: ["push-sw.js"], // daily reminder: push + notificationclick handlers
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "fonts" } },
          { urlPattern: /^https:\/\/upload\.wikimedia\.org\//, handler: "CacheFirst", options: { cacheName: "wiki-img", expiration: { maxEntries: 400 } } },
        ],
      },
    }),
  ],
});
