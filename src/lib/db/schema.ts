import { pgTable, text, timestamp, varchar, index, primaryKey } from "drizzle-orm/pg-core";

export const messages = pgTable(
  "messages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    groupId: varchar("group_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull().default(""),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_group_id_created_at_idx").on(t.groupId, t.createdAt),
  ]
);

// Per-user calendar tokens — composite PK (group_id, user_id)
export const googleTokens = pgTable(
  "google_tokens",
  {
    groupId: varchar("group_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull().default(""),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    calendarId: varchar("calendar_id", { length: 256 }).notNull().default("primary"),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })]
);
