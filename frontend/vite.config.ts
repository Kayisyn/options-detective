import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // relative asset paths so the packaged Electron build can loadFile()
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // during browser-based dev the frontend talks HTTP to Express;
      // inside Electron the preload bridge takes over (Phase 7)
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
