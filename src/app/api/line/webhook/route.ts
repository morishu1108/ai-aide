import { NextRequest, NextResponse } from "next/server";
import {
  WebhookRequestBody,
  MessageEvent,
  TextMessage,
  validateSignature,
  messagingApi,
} from "@line/bot-sdk";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { handleCommand } from "@/lib/commands";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  const isValid = validateSignature(
    rawBody,
    process.env.LINE_CHANNEL_SECRET!,
    signature
  );
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body: WebhookRequestBody = JSON.parse(rawBody);

  await Promise.all(
    body.events.map(async (event) => {
      if (event.type !== "message") return;
      if (event.message.type !== "text") return;

      const msgEvent = event as MessageEvent;
      const textMsg = event.message as TextMessage;
      const text = textMsg.text;

      // グループ or ルームのみ対応
      const source = msgEvent.source;
      if (source.type !== "group" && source.type !== "room") return;

      const groupId = source.type === "group" ? source.groupId : source.roomId;
      const userId = source.userId ?? "unknown";

      // メンション情報を抽出（最初のユーザーメンションのuserId）
      const mentionees = (textMsg as TextMessage & {
        mention?: { mentionees: { type: string; userId?: string }[] };
      }).mention?.mentionees ?? [];
      const mentionedUserId = mentionees.find((m) => m.type === "user")?.userId;

      // ユーザー表示名を取得
      let displayName = "メンバー";
      try {
        if (source.type === "group") {
          const profile = await client.getGroupMemberProfile(groupId, userId);
          displayName = profile.displayName;
        }
      } catch {
        // 取得失敗しても続行
      }

      // メッセージを保存
      await db.insert(messages).values({
        id: msgEvent.message.id,
        groupId,
        userId,
        displayName,
        text,
      });

      // コマンド処理
      let result: { text: string; sendPrivately?: boolean } | null = null;
      try {
        result = await handleCommand(groupId, userId, displayName, text, mentionedUserId);
      } catch (err) {
        console.error("handleCommand error:", err);
        result = { text: "⚠️ エラーが発生しました。しばらく経ってから再度お試しください。" };
      }
      if (!result) return;

      if (result.sendPrivately) {
        // Bot との1対1チャットにDM送信（友達追加が必要）
        try {
          await client.pushMessage({
            to: userId,
            messages: [{ type: "text", text: result.text }],
          });
          // グループには通知のみ
          await client.replyMessage({
            replyToken: msgEvent.replyToken,
            messages: [{ type: "text", text: "📩 結果をDMでお送りしました。" }],
          });
        } catch {
          // DM失敗時はグループに返信
          await client.replyMessage({
            replyToken: msgEvent.replyToken,
            messages: [{ type: "text", text: result.text }],
          });
        }
      } else {
        await client.replyMessage({
          replyToken: msgEvent.replyToken,
          messages: [{ type: "text", text: result.text }],
        });
      }
    })
  );

  return NextResponse.json({ ok: true });
}
