/**
 * Annotation Edits Table
 *
 * Stores an audit trail of annotation edits made through the human
 * review UI. Each edit records the previous and new values as JSONB
 * snapshots, enabling full edit history tracking.
 */
import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { analysisSessions } from "./analysis-sessions";

export const annotationEdits = pgTable("annotation_edits", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => analysisSessions.id, { onDelete: "cascade" }),
  annotationId: text("annotation_id").notNull(),
  previousValue: jsonb("previous_value").notNull(),
  newValue: jsonb("new_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Zod schema for inserting a new annotation edit (auto-generated fields omitted). */
export const insertAnnotationEditSchema = createInsertSchema(
  annotationEdits,
).omit({
  id: true,
  createdAt: true,
});

export type AnnotationEdit = typeof annotationEdits.$inferSelect;
export type InsertAnnotationEdit = z.infer<typeof insertAnnotationEditSchema>;
