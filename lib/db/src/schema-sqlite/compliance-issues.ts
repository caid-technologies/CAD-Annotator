/**
 * Compliance Issues Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `compliance_issues` table with SQLite-compatible types.
 * - `serial` → `integer` with primaryKey (autoincrement)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { analysisSessions } from "./analysis-sessions";

export const complianceIssues = sqliteTable("compliance_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => analysisSessions.id, { onDelete: "cascade" }),
  annotationId: text("annotation_id").notNull(),
  ruleId: text("rule_id").notNull(),
  severity: text("severity", { enum: ["error", "warning"] }).notNull(),
  description: text("description").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ComplianceIssue = typeof complianceIssues.$inferSelect;
export type InsertComplianceIssue = typeof complianceIssues.$inferInsert;
