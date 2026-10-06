import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // MUI marks modules for RSC. This app is a client-only SPA.
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          warning.message.includes("use client")
        )
          return;
        warn(warning);
      },
    },
  },
});
