import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // WSL does not deliver file-change events for /mnt/c; poll instead
  server: { watch: { usePolling: true, interval: 200 } },
  build: { rollupOptions: { input: { main: "index.html", alternatives: "alternatives.html" } } },
});
