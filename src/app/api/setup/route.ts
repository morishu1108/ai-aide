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

  await sql`
    CREATE TABLE IF NOT EXISTS google_tokens (
      group_id VARCHAR(64) PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      calendar_id VARCHAR(256) NOT NULL DEFAULT 'primary'
    )
  `;

  return NextResponse.json({ ok: true, message: "Tables created successfully" });
}
