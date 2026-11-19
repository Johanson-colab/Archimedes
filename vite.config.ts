import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Electron opens production builds through file://, including Windows drive paths.
  base: "./",
  plugins: [react()],
  optimizeDeps: { exclude: ["pdfjs-dist"] },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
