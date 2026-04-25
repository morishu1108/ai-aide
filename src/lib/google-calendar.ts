import { google } from "googleapis";
import { db } from "./db";
import { googleTokens } from "./db/schema";
import { eq } from "drizzle-orm";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function getAuthUrl(groupId: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state: groupId,
  });
}

export async function saveTokens(
  groupId: string,
  code: string
): Promise<void> {
  const { tokens } = await oauth2Client.getToken(code);
  await db
    .insert(googleTokens)
    .values({
      groupId,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: new Date(tokens.expiry_date!),
    })
    .onConflictDoUpdate({
      target: googleTokens.groupId,
      set: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiresAt: new Date(tokens.expiry_date!),
      },
    });
}

async function getAuthedClient(groupId: string) {
  const [token] = await db
    .select()
    .from(googleTokens)
    .where(eq(googleTokens.groupId, groupId));

  if (!token) return null;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  });

  // Refresh if within 5 minutes of expiry
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const { credentials } = await client.refreshAccessToken();
    await db
      .update(googleTokens)
      .set({
        accessToken: credentials.access_token!,
        expiresAt: new Date(credentials.expiry_date!),
      })
      .where(eq(googleTokens.groupId, groupId));
    client.setCredentials(credentials);
  }

  return { client, calendarId: token.calendarId };
}

export async function getUpcomingEvents(groupId: string): Promise<string> {
  const auth = await getAuthedClient(groupId);
  if (!auth) return "⚠️ Googleカレンダーが連携されていません。\n`カレンダー連携` と送信して設定してください。";

  const calendar = google.calendar({ version: "v3", auth: auth.client });
  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: auth.calendarId,
    timeMin: now.toISOString(),
    timeMax: oneWeekLater.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });

  const events = res.data.items ?? [];
  if (events.length === 0) return "📅 今後1週間の予定はありません。";

  const lines = events.map((e) => {
    const start = e.start?.dateTime ?? e.start?.date ?? "";
    const date = new Date(start).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const isFromLine = e.extendedProperties?.private?.["line-secretary"] === "true";
    const label = isFromLine
      ? `${e.summary ?? "(タイトルなし)"}`
      : "（予定あり）";
    return `・${date} ${label}`;
  });

  return `📅 今後1週間の予定:\n${lines.join("\n")}`;
}

export async function addEvent(
  groupId: string,
  title: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<string> {
  const auth = await getAuthedClient(groupId);
  if (!auth) return "⚠️ Googleカレンダーが連携されていません。\n`カレンダー連携` と送信して設定してください。";

  const calendar = google.calendar({ version: "v3", auth: auth.client });

  const event = await calendar.events.insert({
    calendarId: auth.calendarId,
    requestBody: {
      summary: title,
      start: { dateTime: `${date}T${startTime}:00`, timeZone: "Asia/Tokyo" },
      end: { dateTime: `${date}T${endTime}:00`, timeZone: "Asia/Tokyo" },
      extendedProperties: {
        private: { "line-secretary": "true" },
      },
    },
  });

  return `✅ 予定を追加しました！\n「${title}」\n${date} ${startTime}〜${endTime}\n${event.data.htmlLink ?? ""}`;
}

export async function isLinked(groupId: string): Promise<boolean> {
  const [token] = await db
    .select()
    .from(googleTokens)
    .where(eq(googleTokens.groupId, groupId));
  return !!token;
}
