/**
 * Database Connection
 *
 * Initialises a PostgreSQL connection pool and a Drizzle ORM instance.
 * The connection string is read from the `DATABASE_URL` environment variable.
 *
 * Usage:
 *   import { db } from "@workspace/db";
 *   const rows = await db.select().from(someTable);
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Add it to your .env file (see .env.example).",
  );
}

/** Shared PostgreSQL connection pool. */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Drizzle ORM instance with the application schema. */
export const db = drizzle(pool, { schema });

export * from "./schema";
