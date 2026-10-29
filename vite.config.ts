import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // WSL does not deliver file-change events for /mnt/c; poll instead
  server: {
    watch: { usePolling: true, interval: 200 },
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8787" },
  },
});
