/**
 * Messages Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `messages` table with SQLite-compatible types.
 * - `serial` → `integer` with primaryKey (autoincrement)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { conversations } from "./conversations";

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
