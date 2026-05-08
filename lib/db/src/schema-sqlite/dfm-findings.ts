/**
 * DFM Findings Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `dfm_findings` table with SQLite-compatible types.
 * - `jsonb` → `text` (JSON mode)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { analysisSessions } from "./analysis-sessions";

export const dfmFindings = sqliteTable("dfm_findings", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => analysisSessions.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: [
      "over_tolerancing",
      "missing_tolerance",
      "datum_scheme_completeness",
      "surface_finish_consistency",
      "general",
    ],
  }).notNull(),
  severity: text("severity", {
    enum: ["error", "warning", "info"],
  }).notNull(),
  description: text("description").notNull(),
  recommendation: text("recommendation").notNull(),
  relatedAnnotationIds: text("related_annotation_ids", { mode: "json" })
    .$type<string[]>()
    .default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type DfmFinding = typeof dfmFindings.$inferSelect;
export type InsertDfmFinding = typeof dfmFindings.$inferInsert;
