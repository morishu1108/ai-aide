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

type CommandResult = { text: string; sendPrivately?: boolean };

const HELP_TEXT = `🤖 グループ秘書Bot コマンド一覧:

・まとめて — 直近の会話を要約します
・予定確認 — 自分の今後1週間の予定を表示します
・予定確認 @メンション — 指定した人の予定を自分だけに表示します
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
    // メンション付き → 指定ユーザーの予定をプライベートに返す
    if (mentionedUserId) {
      if (!mentionedUserId) {
        return { text: "⚠️ メンションしたユーザーのIDを取得できませんでした。\nLINEのプライバシー設定で「メッセージ情報の利用」を許可してください。", sendPrivately: true };
      }
      const linked = await isLinked(groupId, mentionedUserId);
      if (!linked) {
        return { text: "⚠️ そのメンバーはまだカレンダーを連携していません。", sendPrivately: true };
      }
      const events = await getUpcomingEvents(groupId, mentionedUserId);
      return { text: events, sendPrivately: true };
    }

    // メンションなし → 自分の予定をグループに返す
    const events = await getUpcomingEvents(groupId, userId);
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
