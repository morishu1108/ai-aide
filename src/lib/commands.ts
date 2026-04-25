import { db } from "./db";
import { messages } from "./db/schema";
import { eq, desc } from "drizzle-orm";
import { summarizeMessages, parseScheduleRequest } from "./ai";
import {
  encodeState,
  getUpcomingEvents,
  addEvent,
  getGroupFreeSlots,
  isLinked,
} from "./google-calendar";

const HELP_TEXT = `🤖 グループ秘書Bot コマンド一覧:

・まとめて — 直近の会話を要約します
・予定確認 — 自分の今後1週間の予定を表示します
・予定追加 [内容] — 自然文で予定を追加します
  例: 予定追加 来週月曜15時から会議1時間
・空き時間 — 全員が空いている時間帯を探します
・カレンダー連携 — Googleカレンダーを接続します
・ヘルプ — このメッセージを表示します`;

export async function handleCommand(
  groupId: string,
  userId: string,
  displayName: string,
  text: string
): Promise<string | null> {
  const t = text.trim();

  if (t === "ヘルプ" || t === "help") {
    return HELP_TEXT;
  }

  if (t === "まとめて" || t === "まとめ" || t === "要約") {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.groupId, groupId))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    return await summarizeMessages(rows.reverse());
  }

  if (t === "予定確認" || t === "予定" || t === "カレンダー") {
    return await getUpcomingEvents(groupId, userId);
  }

  if (t === "空き時間" || t.startsWith("空き時間")) {
    return await getGroupFreeSlots(groupId);
  }

  if (t === "カレンダー連携" || t === "連携") {
    const linked = await isLinked(groupId, userId);
    if (linked) {
      return "✅ すでにGoogleカレンダーと連携済みです。\n再連携するには再度「カレンダー連携」と送信してください。";
    }
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ai-aide.vercel.app";
    const state = encodeState(groupId, userId, displayName);
    const url = `${baseUrl}/api/auth/google?state=${state}&openExternalBrowser=1`;
    return `🔗 以下のURLからGoogleカレンダーを連携してください:\n${url}`;
  }

  if (t.startsWith("予定追加")) {
    const request = t.replace(/^予定追加\s*/, "").trim();
    if (!request) return "予定の内容を入力してください。\n例: 予定追加 来週月曜15時から1時間会議";
    const parsed = await parseScheduleRequest(request);
    if (!parsed) return "予定の解析ができませんでした。\n日時と内容をもう少し詳しく教えてください。";
    return await addEvent(groupId, userId, parsed.title, parsed.date, parsed.startTime, parsed.endTime);
  }

  return null;
}
