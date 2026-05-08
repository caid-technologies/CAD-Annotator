/**
 * Database Adapter
 *
 * Selects the database driver based on the `DATABASE_URL` environment variable:
 * - When `DATABASE_URL` is set → PostgreSQL via `pg`
 * - When `DATABASE_URL` is absent → SQLite via `better-sqlite3` (file: `cad-annotator.db`)
 *
 * The exported `db` instance provides the same Drizzle ORM interface regardless
 * of the underlying dialect, so consuming code requires no changes.
 */
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import pg from "pg";
import Database from "better-sqlite3";

import * as pgSchema from "./schema/index";
import * as sqliteSchema from "./schema-sqlite/index";

const { Pool } = pg;

export type Dialect = "postgresql" | "sqlite";

/** Detect which dialect to use based on environment. */
export function detectDialect(): Dialect {
  if (process.env.DATABASE_URL) {
    return "postgresql";
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL must be set in production. " +
        "SQLite fallback is not supported in a production environment.",
    );
  }

  return "sqlite";
}

/** Create a Drizzle ORM instance for the detected dialect. */
function createDatabase() {
  const dialect = detectDialect();

  if (dialect === "postgresql") {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return {
      db: drizzlePg(pool, { schema: pgSchema }),
      dialect: "postgresql" as const,
      pool,
    };
  }

  const sqlite = new Database("cad-annotator.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return {
    db: drizzleSqlite(sqlite, { schema: sqliteSchema }),
    dialect: "sqlite" as const,
    sqlite,
  };
}

const instance = createDatabase();

/** Drizzle ORM instance — works with either PostgreSQL or SQLite. */
export const db = instance.db;

/** The active dialect ("postgresql" or "sqlite"). */
export const activeDialect = instance.dialect;
