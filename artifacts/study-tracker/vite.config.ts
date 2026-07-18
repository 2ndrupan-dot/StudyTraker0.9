import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port = rawPort && !Number.isNaN(Number(rawPort)) && Number(rawPort) > 0
  ? Number(rawPort)
  : 3000;

const basePath = process.env.BASE_PATH || "/";
const isReplit = process.env.REPL_ID !== undefined;
const isDev = process.env.NODE_ENV !== "production";

// ─── Dev-only: suppress Firestore HMR assertion errors in the overlay ────────
// "da08" fires when HMR re-executes context modules while old Firestore
// WebSocket listeners are still alive. It is harmless (the page self-recovers)
// but the Replit runtime-error overlay intercepts `unhandledrejection` before
// any app-level handler can call `e.preventDefault()`.
// Injecting an inline <script> at the very top of <head> (order: 'pre') puts
// our capture-phase handler ahead of every plugin or module script.
const suppressFirestoreHmrError = {
  name: 'suppress-firestore-hmr-error',
  transformIndexHtml: {
    order: 'pre' as const,
    handler: () => isDev ? [{
      tag: 'script',
      attrs: { type: 'text/javascript' },
      injectTo: 'head-prepend' as const,
      children: `window.addEventListener('unhandledrejection',function(e){var m=e&&e.reason&&e.reason.message||'';if(m.indexOf('FIRESTORE')>-1&&m.indexOf('INTERNAL ASSERTION FAILED')>-1){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});`,
    }] : [],
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    suppressFirestoreHmrError,
    // Replit-only dev plugins — never included in production builds
    ...(isDev && isReplit
      ? [
          await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
            m.default(),
          ),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
