import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL(".", import.meta.url));
// Dev proxies /api to a running server.js. Main tree runs it on 8899; override with CT_API_PORT.
const apiPort = process.env.CT_API_PORT || "8899";

export default defineConfig({
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.CT_WEB_PORT || 5173),
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}` } }
  },
  build: {
    outDir: "../ui-dist",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    manifest: true,
    modulePreload: { polyfill: false }
  },
  test: {
    root,
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
