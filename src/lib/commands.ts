import { db } from "./db";
import { messages } from "./db/schema";
import { eq, desc } from "drizzle-orm";
import { summarizeMessages, parseScheduleRequest } from "./ai";
import {
  encodeState,
  getUpcomingEvents,
  getGroupUpcomingEvents,
  addEvent,
  getGroupFreeSlots,
  isLinked,
} from "./google-calendar";

type CommandResult = { text: string; sendPrivately?: boolean };

const JST = 9 * 60 * 60 * 1000;

function jstDayRange(offsetDays: number): { start: Date; end: Date } {
  const nowJST = new Date(Date.now() + JST);
  const base = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate() + offsetDays));
  const start = new Date(base.getTime() - JST);           // JST 00:00 as UTC
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1); // JST 23:59:59 as UTC
  return { start, end };
}

function parseDateFilter(arg: string): { start: Date; end: Date; label: string } | null {
  const t = arg.trim();
  if (!t) return null;

  if (t === "今日" || t === "本日") {
    return { ...jstDayRange(0), label: "今日" };
  }
  if (t === "明日") {
    return { ...jstDayRange(1), label: "明日" };
  }
  if (t === "明後日") {
    return { ...jstDayRange(2), label: "明後日" };
  }

  // M/D または M月D日
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  const kanji = t.match(/^(\d{1,2})月(\d{1,2})日$/);
  const m = slash ?? kanji;
  if (m) {
    const nowJST = new Date(Date.now() + JST);
    let year = nowJST.getUTCFullYear();
    const month = parseInt(m[1]) - 1;
    const day = parseInt(m[2]);
    const candidate = new Date(Date.UTC(year, month, day));
    // 過去日なら来年とみなす
    if (candidate.getTime() - JST < new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate())).getTime()) {
      year += 1;
    }
    const start = new Date(Date.UTC(year, month, day) - JST);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start, end, label: `${parseInt(m[1])}/${parseInt(m[2])}` };
  }

  return null;
}

const HELP_TEXT = `🤖 グループ秘書Bot コマンド一覧:

・まとめて — 直近の会話を要約します
・予定確認 — 連携済み全員の今後1週間の予定を表示します
・予定確認 今日/明日/明後日/4/27 — 指定日の予定を表示します
・予定確認 @メンション — 指定した人の予定を自分だけに表示します
・予定確認 @メンション 今日 — 組み合わせも可能です
・予定追加 [内容] — 自然文で予定を追加します
  例: 予定追加 来週月曜15時から会議1時間
・空き時間 — 全員が空いている時間帯を探します
・カレンダー連携 — Googleカレンダーを接続します
・ヘルプ — このメッセージを表示します`;

export async function handleCommand(
  groupId: string,
  userId: string,
  displayName: string,
  text: string,
  mentionedUserId?: string
): Promise<CommandResult | null> {
  const t = text.trim();

  if (t === "ヘルプ" || t === "help") {
    return { text: HELP_TEXT };
  }

  if (t === "まとめて" || t === "まとめ" || t === "要約") {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.groupId, groupId))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    const summary = await summarizeMessages(rows.reverse());
    return { text: summary };
  }

  if (t.startsWith("予定確認") || t === "予定" || t === "カレンダー") {
    const arg = t.replace(/^予定確認\s*/, "").replace(/^予定$/, "").replace(/^カレンダー$/, "").trim();
    // メンションを除いた残りの文字列から日付を抽出
    const dateArg = arg.replace(/@\S+/g, "").trim();
    const dateRange = parseDateFilter(dateArg) ?? undefined;

    // メンション付き → 指定ユーザーの予定をプライベートに返す
    if (mentionedUserId) {
      const linked = await isLinked(groupId, mentionedUserId);
      if (!linked) {
        return { text: "⚠️ そのメンバーはまだカレンダーを連携していません。", sendPrivately: true };
      }
      const events = await getUpcomingEvents(groupId, mentionedUserId, dateRange);
      return { text: events, sendPrivately: true };
    }

    // メンションなし → 連携済みメンバー全員の予定をグループに返す
    const events = await getGroupUpcomingEvents(groupId, dateRange);
    return { text: events };
  }

  if (t === "空き時間" || t.startsWith("空き時間")) {
    const slots = await getGroupFreeSlots(groupId);
    return { text: slots };
  }

  if (t === "カレンダー連携" || t === "連携") {
    const linked = await isLinked(groupId, userId);
    if (linked) {
      return { text: "✅ すでにGoogleカレンダーと連携済みです。\n再連携するには再度「カレンダー連携」と送信してください。" };
    }
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ai-aide.vercel.app";
    const state = encodeState(groupId, userId, displayName);
    const url = `${baseUrl}/api/auth/google?state=${state}&openExternalBrowser=1`;
    return { text: `🔗 以下のURLからGoogleカレンダーを連携してください:\n${url}` };
  }

  if (t.startsWith("予定追加")) {
    const request = t.replace(/^予定追加\s*/, "").trim();
    if (!request) return { text: "予定の内容を入力してください。\n例: 予定追加 来週月曜15時から1時間会議" };
    const parsed = await parseScheduleRequest(request);
    if (!parsed) return { text: "予定の解析ができませんでした。\n日時と内容をもう少し詳しく教えてください。" };
    const result = await addEvent(groupId, userId, parsed.title, parsed.date, parsed.startTime, parsed.endTime);
    return { text: result };
  }

  return null;
}
