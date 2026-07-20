import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";

// single source of truth for the version shown in Settings
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

export default defineConfig(({ mode }) => {
  // OD_BACKEND_PORT (env or frontend/.env.local) points the dev proxy at a
  // non-default backend — lets a dev server run alongside the installed app,
  // which holds the default port 3001.
  const env = loadEnv(mode, process.cwd(), "OD_");
  const backendPort = env.OD_BACKEND_PORT || process.env.OD_BACKEND_PORT || "3001";
  return {
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    // relative asset paths so the packaged Electron build can loadFile()
    base: "./",
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // during browser-based dev the frontend talks HTTP to Express;
        // inside Electron the preload bridge takes over (Phase 7)
        "/api": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
