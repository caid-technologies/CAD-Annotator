/**
 * Database Connection
 *
 * Provides a Drizzle ORM instance that auto-selects the database driver:
 * - PostgreSQL when `DATABASE_URL` is set
 * - SQLite fallback (`cad-annotator.db`) when `DATABASE_URL` is absent
 *
 * Usage:
 *   import { db } from "@workspace/db";
 *   const rows = await db.select().from(someTable);
 */
export { db, activeDialect, detectDialect } from "./adapter";
export type { Dialect } from "./adapter";

export * from "./schema";
