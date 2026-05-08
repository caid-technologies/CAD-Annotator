/**
 * GD&T Annotations Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `gdt_annotations` table with SQLite-compatible types.
 * - `jsonb` → `text` (JSON mode)
 * - `real` → `real`
 * - `boolean` → `integer` (0/1)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 */
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { analysisSessions } from "./analysis-sessions";

export const gdtAnnotations = sqliteTable("gdt_annotations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => analysisSessions.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["dimension", "fcf", "datum", "surface_finish", "note"],
  }).notNull(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  view: text("view").notNull(),
  boundingBox: text("bounding_box", { mode: "json" })
    .$type<{
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }>()
    .notNull(),
  confidence: real("confidence").notNull(),
  needsReview: integer("needs_review", { mode: "boolean" })
    .notNull()
    .default(false),
  description: text("description"),
  typeData: text("type_data", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type GdtAnnotation = typeof gdtAnnotations.$inferSelect;
export type InsertGdtAnnotation = typeof gdtAnnotations.$inferInsert;
