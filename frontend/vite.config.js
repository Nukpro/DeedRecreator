import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src"),
  build: {
    outDir: resolve(__dirname, "../static/dist"),
    emptyOutDir: true,
    assetsDir: "",
    rollupOptions: {
      input: {
        drafter: resolve(__dirname, "src/pages/drafter/main.js")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]"
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1"
  }
});

