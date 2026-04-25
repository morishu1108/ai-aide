import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/google-calendar";
import { messagingApi } from "@line/bot-sdk";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  try {
    const groupId = await saveTokens(state, code);

    await client.pushMessage({
      to: groupId,
      messages: [
        {
          type: "text",
          text: "✅ Googleカレンダーの連携が完了しました！\n「予定確認」で今後の予定を確認できます。",
        },
      ],
    });

    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fff4">
        <h2 style="color:#06C755">✅ 連携完了！</h2>
        <p style="color:#333">Googleカレンダーとの連携が完了しました。</p>
        <a href="https://line.me/R/ti/g/${groupId}"
           style="display:inline-block;margin-top:16px;padding:12px 28px;background:#06C755;color:#fff;border-radius:24px;text-decoration:none;font-weight:bold;font-size:16px">
          LINEグループに戻る
        </a>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ エラーが発生しました</h2>
        <p>もう一度「カレンダー連携」と送信してお試しください。</p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
