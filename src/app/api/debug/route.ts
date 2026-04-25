import { NextResponse } from "next/server";
import { generateText, gateway } from "ai";

export async function GET(): Promise<NextResponse> {
  const checks = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    LINE_CHANNEL_ACCESS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI,
    AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY,
  };

  let aiTest: { ok: boolean; error?: string } = { ok: false };
  try {
    const { text } = await generateText({
      model: gateway("anthropic/claude-haiku-4.5"),
      prompt: "「OK」とだけ返してください",
    });
    aiTest = { ok: true, error: text };
  } catch (err) {
    aiTest = { ok: false, error: String(err) };
  }

  return NextResponse.json({ checks, aiTest });
}
