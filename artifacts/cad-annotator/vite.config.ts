/**
 * Vite configuration for the CAD Annotator frontend.
 *
 * Builds a React SPA with TailwindCSS. In development, runs a hot-reloading
 * dev server; in production, outputs optimised static assets to `dist/public/`.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/* -------------------------------------------------------------------------- */
/*  Environment validation                                                     */
/* -------------------------------------------------------------------------- */

const port = Number(process.env.PORT || "5173");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

/** URL base path — defaults to "/" for standard deployments. */
const basePath = process.env.BASE_PATH || "/";

/**
 * Local API target used by the dev server proxy.
 * Keep frontend requests same-origin during development by forwarding `/api`
 * to the separately running API server.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:8080";

/* -------------------------------------------------------------------------- */
/*  Vite config                                                                */
/* -------------------------------------------------------------------------- */

export default defineConfig({
  base: basePath,

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      /** Shorthand for importing from `src/` — e.g. `@/components/ui/button` */
      "@": path.resolve(import.meta.dirname, "src"),
      /** Shared attached assets from the workspace root */
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    /** Prevent duplicate React instances when linking workspace packages */
    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },

  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
