/**
 * Compliance Issues Table
 *
 * Stores ASME Y14.5-2018 compliance violations found by the deterministic
 * rules engine. Each issue references a specific annotation within an
 * analysis session and includes a rule ID, severity, and description.
 */
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { analysisSessions } from "./analysis-sessions";

export const complianceIssues = pgTable("compliance_issues", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => analysisSessions.id, { onDelete: "cascade" }),
  annotationId: text("annotation_id").notNull(),
  ruleId: text("rule_id").notNull(),
  severity: text("severity", { enum: ["error", "warning"] }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Zod schema for inserting a new compliance issue (auto-generated fields omitted). */
export const insertComplianceIssueSchema = createInsertSchema(
  complianceIssues,
).omit({
  id: true,
  createdAt: true,
});

export type ComplianceIssue = typeof complianceIssues.$inferSelect;
export type InsertComplianceIssue = z.infer<typeof insertComplianceIssueSchema>;
