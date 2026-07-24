import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    ...(host === undefined ? {} : { host }),
    hmr:
      host === undefined
        ? undefined
        : {
            protocol: "ws",
            host,
            port: 1421,
          },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri 2 runs in evergreen WebView2/WKWebView/WebKitGTK engines.
    target: "es2020",
    minify: process.env.TAURI_ENV_DEBUG === "true" ? false : "esbuild",
    sourcemap: process.env.TAURI_ENV_DEBUG === "true",
  },
});
