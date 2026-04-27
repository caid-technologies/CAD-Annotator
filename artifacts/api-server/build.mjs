/**
 * API Server Build Script
 *
 * Uses ESBuild to bundle the Express server into a single ESM file.
 * The output is written to `dist/index.mjs` with linked source maps.
 *
 * Key decisions:
 * - Bundles everything into one file for simpler deployment
 * - Externalises native modules and heavy SDKs that can't be bundled
 * - Uses esbuild-plugin-pino to handle Pino's worker-based logging
 * - Adds a CJS compatibility banner for packages like Express that use require()
 *
 * Run: `node ./build.mjs`
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Some plugins (e.g. esbuild-plugin-pino) use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");

  // Clean previous build output
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",

    /**
     * Packages that cannot be bundled — typically because they:
     * - Use native Node.js addons (*.node files)
     * - Dynamically load sibling files at runtime
     * - Are too large or complex for static analysis
     *
     * Add entries here if you encounter bundling errors with new dependencies.
     */
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],

    sourcemap: "linked",

    plugins: [
      // Pino uses worker threads for logging — this plugin ensures the
      // worker files are correctly resolved in the bundled output
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],

    /**
     * CJS compatibility banner.
     * Express and some other packages are CommonJS-only. Since our output
     * is ESM, we need to polyfill `require`, `__filename`, and `__dirname`
     * so these packages work correctly in the bundled output.
     */
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
