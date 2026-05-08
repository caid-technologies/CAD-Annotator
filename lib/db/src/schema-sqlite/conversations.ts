/**
 * Conversations Table (SQLite dialect)
 *
 * Mirrors the PostgreSQL `conversations` table with SQLite-compatible types.
 * - `serial` → `integer` with primaryKey (autoincrement)
 * - `timestamp` → `integer` (Unix epoch milliseconds)
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
