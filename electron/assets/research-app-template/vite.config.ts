import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ base: "./", plugins: [react()], publicDir: false, build: { outDir: "public", emptyOutDir: true }, server: { host: "127.0.0.1", proxy: process.env.ARCHIMEDES_DEV_API ? { "/api": process.env.ARCHIMEDES_DEV_API } : undefined } });
