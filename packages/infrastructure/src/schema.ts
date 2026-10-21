import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const workspace = sqliteTable("workspace", {
  slot: integer("slot").primaryKey(),
  id: text("id").notNull().unique(),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
});
