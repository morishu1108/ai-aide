import { google } from "googleapis";
import { db } from "./db";
import { googleTokens } from "./db/schema";
import { eq, and } from "drizzle-orm";

const JST = 9 * 60 * 60 * 1000;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function encodeState(groupId: string, userId: string, displayName: string): string {
  return Buffer.from(JSON.stringify({ groupId, userId, displayName })).toString("base64url");
}

export function generateOAuthUrl(state: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state,
  });
}

export async function saveTokens(state: string, code: string): Promise<string> {
  const { groupId, userId, displayName } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf-8")
  ) as { groupId: string; userId: string; displayName: string };

  const { tokens } = await oauth2Client.getToken(code);
  await db
    .insert(googleTokens)
    .values({
      groupId,
      userId,
      displayName,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: new Date(tokens.expiry_date!),
    })
    .onConflictDoUpdate({
      target: [googleTokens.groupId, googleTokens.userId],
      set: {
        displayName,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiresAt: new Date(tokens.expiry_date!),
      },
    });

  return groupId;
}

type TokenRow = typeof googleTokens.$inferSelect;

async function makeClient(token: TokenRow) {
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

  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const { credentials } = await client.refreshAccessToken();
    await db
      .update(googleTokens)
      .set({ accessToken: credentials.access_token!, expiresAt: new Date(credentials.expiry_date!) })
      .where(and(eq(googleTokens.groupId, token.groupId), eq(googleTokens.userId, token.userId)));
    client.setCredentials(credentials);
  }

  return { client, calendarId: token.calendarId };
}

async function getTokenForUser(groupId: string, userId: string) {
  const [token] = await db
    .select()
    .from(googleTokens)
    .where(and(eq(googleTokens.groupId, groupId), eq(googleTokens.userId, userId)));
  return token ?? null;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTime(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function getUpcomingEvents(
  groupId: string,
  userId: string,
  dateRange?: { start: Date; end: Date; label: string }
): Promise<string> {
  const token = await getTokenForUser(groupId, userId);
  if (!token) return "⚠️ あなたのGoogleカレンダーが連携されていません。\n`カレンダー連携` と送信して設定してください。";

  const auth = await makeClient(token);
  const calendar = google.calendar({ version: "v3", auth: auth.client });
  const now = new Date();

  const timeMin = dateRange?.start ?? now;
  const timeMax = dateRange?.end ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const label = dateRange?.label ?? "今後1週間";

  const res = await calendar.events.list({
    calendarId: auth.calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });

  const events = res.data.items ?? [];
  if (events.length === 0) return `📅 ${label}の予定はありません。`;

  // Group events by JST date string (e.g. "4/26")
  const byDate = new Map<string, string[]>();
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  for (const e of events) {
    const startRaw = e.start?.dateTime ?? e.start?.date ?? "";
    const endRaw = e.end?.dateTime ?? e.end?.date ?? "";
    const startDate = new Date(startRaw);
    const isAllDay = !e.start?.dateTime;

    const jstStart = new Date(startDate.getTime() + JST);
    const dateKey = `${jstStart.getUTCMonth() + 1}/${jstStart.getUTCDate()}`;
    const weekday = WEEKDAYS[new Date(startDate).getDay()];
    const header = `■${dateKey}(${weekday})`;

    const timeStr = isAllDay
      ? "終日"
      : `${formatTime(startDate)}-${formatTime(new Date(endRaw))}`;

    const isFromLine = e.extendedProperties?.private?.["line-secretary"] === groupId;
    const initial = token.displayName ? token.displayName.charAt(0) : "?";
    const title = isFromLine ? e.summary ?? "(タイトルなし)" : `（予定有 ${initial}）`;

    if (!byDate.has(header)) byDate.set(header, []);
    byDate.get(header)!.push(`${timeStr} ${title}`);
  }

  const sections = Array.from(byDate.entries()).map(
    ([header, items]) => `${header}\n${items.join("\n")}`
  );

  return `📅 ${label}の予定:\n\n${sections.join("\n\n")}`;
}

export async function addEvent(
  groupId: string,
  userId: string,
  title: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<string> {
  const token = await getTokenForUser(groupId, userId);
  if (!token) return "⚠️ あなたのGoogleカレンダーが連携されていません。\n`カレンダー連携` と送信して設定してください。";

  const auth = await makeClient(token);
  const calendar = google.calendar({ version: "v3", auth: auth.client });

  const event = await calendar.events.insert({
    calendarId: auth.calendarId,
    requestBody: {
      summary: title,
      start: { dateTime: `${date}T${startTime}:00`, timeZone: "Asia/Tokyo" },
      end: { dateTime: `${date}T${endTime}:00`, timeZone: "Asia/Tokyo" },
      extendedProperties: { private: { "line-secretary": groupId } },
    },
  });

  return `✅ 予定を追加しました！\n「${title}」\n${date} ${startTime}〜${endTime}\n${event.data.htmlLink ?? ""}`;
}

export async function getGroupFreeSlots(groupId: string): Promise<string> {
  const tokens = await db.select().from(googleTokens).where(eq(googleTokens.groupId, groupId));
  if (tokens.length === 0) {
    return "⚠️ カレンダーを連携しているメンバーがいません。\n各自が `カレンダー連携` を送信してください。";
  }

  // Search range: tomorrow JST midnight → 7 days later
  const nowJST = new Date(Date.now() + JST);
  const tomorrowJSTMidnight = new Date(
    Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate() + 1) - JST
  );
  const rangeEnd = new Date(tomorrowJSTMidnight.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Collect all busy intervals from every linked member
  const allBusy: { start: Date; end: Date }[] = [];

  for (const token of tokens) {
    const auth = await makeClient(token);
    const calendar = google.calendar({ version: "v3", auth: auth.client });
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: tomorrowJSTMidnight.toISOString(),
        timeMax: rangeEnd.toISOString(),
        timeZone: "Asia/Tokyo",
        items: [{ id: auth.calendarId }],
      },
    });
    const busy = res.data.calendars?.[auth.calendarId]?.busy ?? [];
    for (const b of busy) {
      if (b.start && b.end) allBusy.push({ start: new Date(b.start), end: new Date(b.end) });
    }
  }

  // Preferred hours: 9-12, 13-17 JST  Non-preferred: 12-13 (lunch), 17-21 (evening)
  const PREFERRED = [9,10,11,13,14,15,16];
  const NON_PREFERRED = [12,17,18,19,20];

  function collectFreeSlots(hours: number[], limit: number): Date[] {
    const result: Date[] = [];
    let dayStart = tomorrowJSTMidnight;
    for (let d = 0; d < 7 && result.length < limit; d++) {
      for (const h of hours) {
        if (result.length >= limit) break;
        const slotStart = new Date(dayStart.getTime() + h * 3600000);
        const slotEnd = new Date(slotStart.getTime() + 3600000);
        const isBusy = allBusy.some((b) => b.start < slotEnd && b.end > slotStart);
        if (!isBusy) result.push(slotStart);
      }
      dayStart = new Date(dayStart.getTime() + 24 * 3600000);
    }
    return result;
  }

  // Try preferred hours first; fall back to non-preferred only if not enough
  let freeSlots = collectFreeSlots(PREFERRED, 5);
  let usedFallback = false;
  if (freeSlots.length < 5) {
    const fallback = collectFreeSlots(NON_PREFERRED, 5 - freeSlots.length);
    if (fallback.length > 0) {
      freeSlots = [...freeSlots, ...fallback].sort((a, b) => a.getTime() - b.getTime());
      usedFallback = true;
    }
  }

  if (freeSlots.length === 0) {
    return "😔 今後7日間で全員が空いている1時間枠が見つかりませんでした。";
  }

  const memberNames = tokens.map((t) => t.displayName || "メンバー").join("・");
  const lines = freeSlots.map((s) => {
    const e = new Date(s.getTime() + 3600000);
    const h = Number(formatTime(s).split(":")[0]);
    const isNonPreferred = h === 12 || h >= 17;
    const label = isNonPreferred ? " ⚠️" : "";
    return `・${formatDateTime(s)}〜${formatTime(e)}${label}`;
  });

  const note = usedFallback ? "\n⚠️ = 昼休み・夕方以降のみ空いている時間帯" : "";
  return `🗓 【${memberNames}】\n全員が空いている時間帯（1時間枠）:\n${lines.join("\n")}${note}`;
}

export async function isLinked(groupId: string, userId: string): Promise<boolean> {
  const token = await getTokenForUser(groupId, userId);
  return !!token;
}
