/**
 * Analysis Sessions Table
 *
 * Stores GD&T analysis pipeline sessions. Each session represents a
 * complete pipeline run including annotations, compliance issues, and
 * DFM findings. Sessions track status and any stage errors that occurred.
 */
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysisSessions = pgTable("analysis_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  imageReference: text("image_reference").notNull(),
  status: text("status", {
    enum: ["completed", "partial", "failed"],
  }).notNull(),
  description: text("description"),
  views: jsonb("views").$type<string[]>().notNull().default([]),
  stageErrors: jsonb("stage_errors")
    .$type<{ stage: string; message: string }[]>()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Zod schema for inserting a new analysis session (auto-generated fields omitted). */
export const insertAnalysisSessionSchema = createInsertSchema(
  analysisSessions,
).omit({
  createdAt: true,
  updatedAt: true,
});

export type AnalysisSession = typeof analysisSessions.$inferSelect;
export type InsertAnalysisSession = z.infer<typeof insertAnalysisSessionSchema>;
