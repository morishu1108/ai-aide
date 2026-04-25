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

      const groupId =
        source.type === "group" ? source.groupId : source.roomId;
      const userId = source.userId ?? "unknown";

      // ユーザー表示名を取得（グループ限定）
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
      let reply: string | null = null;
      try {
        reply = await handleCommand(groupId, userId, text);
      } catch (err) {
        console.error("handleCommand error:", err);
        reply = "⚠️ エラーが発生しました。しばらく経ってから再度お試しください。";
      }
      if (!reply) return;

      await client.replyMessage({
        replyToken: msgEvent.replyToken,
        messages: [{ type: "text", text: reply }],
      });
    })
  );

  return NextResponse.json({ ok: true });
}
