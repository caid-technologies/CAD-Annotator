/**
 * Vite configuration for the Mockup Sandbox.
 *
 * This is a component preview server used during development to render
 * individual UI components in isolation. It auto-discovers `.tsx` files
 * in `src/components/mockups/` and makes them available at `/preview/<name>`.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

/* -------------------------------------------------------------------------- */
/*  Environment validation                                                     */
/* -------------------------------------------------------------------------- */

const port = Number(process.env.PORT || "8081");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

/** URL base path — defaults to "/" for standard deployments. */
const basePath = process.env.BASE_PATH || "/";

/* -------------------------------------------------------------------------- */
/*  Vite config                                                                */
/* -------------------------------------------------------------------------- */

export default defineConfig({
  base: basePath,

  plugins: [mockupPreviewPlugin(), react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },

  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
