import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
