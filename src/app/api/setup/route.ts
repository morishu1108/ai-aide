import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// One-time DB setup endpoint — call once after deploy, then remove or protect.
export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development" && !process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      group_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      display_name VARCHAR(128) NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS messages_group_id_created_at_idx
    ON messages (group_id, created_at)
  `;

  // Migrate google_tokens to per-user composite PK
  await sql`
    ALTER TABLE google_tokens
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NOT NULL DEFAULT '__group__',
      ADD COLUMN IF NOT EXISTS display_name VARCHAR(128) NOT NULL DEFAULT ''
  `;
  await sql`ALTER TABLE google_tokens DROP CONSTRAINT IF EXISTS google_tokens_pkey`;
  // Remove stale rows from old single-calendar-per-group format
  await sql`DELETE FROM google_tokens WHERE user_id = '__group__'`;
  await sql`ALTER TABLE google_tokens ADD PRIMARY KEY (group_id, user_id)`;

  return NextResponse.json({ ok: true, message: "Migration completed" });
}
