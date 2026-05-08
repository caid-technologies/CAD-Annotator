/**
 * Drizzle Kit Configuration
 *
 * Used by `drizzle-kit push` to synchronise the database schema
 * with the TypeScript schema definitions.
 *
 * - When `DATABASE_URL` is set → pushes to PostgreSQL using `./src/schema/`
 * - When `DATABASE_URL` is absent → pushes to SQLite (`cad-annotator.db`) using `./src/schema-sqlite/`
 */
import { defineConfig } from "drizzle-kit";
import path from "path";

const isPostgres = !!process.env.DATABASE_URL;

export default defineConfig(
  isPostgres
    ? {
        schema: path.join(__dirname, "./src/schema/index.ts"),
        dialect: "postgresql",
        dbCredentials: {
          url: process.env.DATABASE_URL!,
        },
      }
    : {
        schema: path.join(__dirname, "./src/schema-sqlite/index.ts"),
        dialect: "sqlite",
        dbCredentials: {
          url: "cad-annotator.db",
        },
      },
);
