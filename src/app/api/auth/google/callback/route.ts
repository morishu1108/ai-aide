import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/google-calendar";
import { messagingApi } from "@line/bot-sdk";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const groupId = searchParams.get("state");

  if (!code || !groupId) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  try {
    await saveTokens(groupId, code);

    // グループに連携完了を通知
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
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>✅ 連携完了！</h2>
        <p>Googleカレンダーとの連携が完了しました。<br>LINEグループに戻ってご利用ください。</p>
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
