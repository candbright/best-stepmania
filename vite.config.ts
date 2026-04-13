import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async ({ command }) => ({
  plugins: [vue()],
  // Any production bundle used by Tauri must resolve chunks relatively.
  base: command === "build" ? "./" : "/",
  build: {
    // Tauri/WebView2 in release can intermittently fail route-level CSS preload.
    // Keep a single stylesheet to avoid async CSS preload failures on startup.
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
