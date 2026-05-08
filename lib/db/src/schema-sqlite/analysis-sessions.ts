/**
 * Analysis Sessions Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `analysis_sessions` table with SQLite-compatible types.
 * - `jsonb` → `text` (JSON serialized as string)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 * - `pgTable` → `sqliteTable`
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analysisSessions = sqliteTable("analysis_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  imageReference: text("image_reference").notNull(),
  status: text("status", {
    enum: ["completed", "partial", "failed"],
  }).notNull(),
  description: text("description"),
  views: text("views", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  stageErrors: text("stage_errors", { mode: "json" })
    .$type<{ stage: string; message: string }[]>()
    .default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AnalysisSession = typeof analysisSessions.$inferSelect;
export type InsertAnalysisSession = typeof analysisSessions.$inferInsert;
