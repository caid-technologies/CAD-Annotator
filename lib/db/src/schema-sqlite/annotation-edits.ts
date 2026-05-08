/**
 * Annotation Edits Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `annotation_edits` table with SQLite-compatible types.
 * - `serial` → `integer` with primaryKey (autoincrement)
 * - `jsonb` → `text` (JSON mode)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { analysisSessions } from "./analysis-sessions";

export const annotationEdits = sqliteTable("annotation_edits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => analysisSessions.id, { onDelete: "cascade" }),
  annotationId: text("annotation_id").notNull(),
  previousValue: text("previous_value", { mode: "json" }).notNull(),
  newValue: text("new_value", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AnnotationEdit = typeof annotationEdits.$inferSelect;
export type InsertAnnotationEdit = typeof annotationEdits.$inferInsert;
