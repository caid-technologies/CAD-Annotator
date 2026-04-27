/**
 * Drizzle Kit Configuration
 *
 * Used by `drizzle-kit push` to synchronise the database schema
 * with the TypeScript schema definitions in `./src/schema/`.
 */
import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Add it to your .env file (see .env.example).",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
