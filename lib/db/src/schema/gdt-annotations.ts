/**
 * GD&T Annotations Table
 *
 * Stores enriched GD&T annotations extracted from CAD drawings. Each
 * annotation belongs to an analysis session and is classified by type
 * (dimension, fcf, datum, surface_finish, note). Type-specific fields
 * are stored in the `typeData` JSONB column.
 */
import {
  boolean,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { analysisSessions } from "./analysis-sessions";

export const gdtAnnotations = pgTable("gdt_annotations", {
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
  boundingBox: jsonb("bounding_box")
    .$type<{
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }>()
    .notNull(),
  confidence: real("confidence").notNull(),
  needsReview: boolean("needs_review").notNull().default(false),
  description: text("description"),
  typeData: jsonb("type_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Zod schema for inserting a new GD&T annotation (auto-generated fields omitted). */
export const insertGdtAnnotationSchema = createInsertSchema(
  gdtAnnotations,
).omit({
  createdAt: true,
});

export type GdtAnnotation = typeof gdtAnnotations.$inferSelect;
export type InsertGdtAnnotation = z.infer<typeof insertGdtAnnotationSchema>;
