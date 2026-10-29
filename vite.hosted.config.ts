import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single-file build for hosting: one classic script + one stylesheet, no chunks
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-hosted",
    cssCodeSplit: false,
    rollupOptions: { input: "alternatives.html", output: { format: "iife", inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app[extname]" } },
  },
});
