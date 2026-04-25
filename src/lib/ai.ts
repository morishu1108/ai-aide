import { generateText, gateway } from "ai";

const MODEL = "anthropic/claude-haiku-4.5";

type Message = { displayName: string; text: string; createdAt: Date };

export async function summarizeMessages(messages: Message[]): Promise<string> {
  if (messages.length === 0) return "まとめる会話がありません。";

  const conversation = messages
    .map((m) => `[${m.displayName}] ${m.text}`)
    .join("\n");

  const { text } = await generateText({
    model: gateway(MODEL),
    system:
      "あなたはグループチャットの秘書AIです。会話を日本語で簡潔にまとめてください。" +
      "要点を箇条書きで3〜7点に整理し、最後に全体の流れを1〜2文で説明してください。",
    prompt: `以下のグループチャットの会話をまとめてください:\n\n${conversation}`,
  });

  return text;
}

export async function parseScheduleRequest(userText: string): Promise<{
  title: string;
  date: string;
  startTime: string;
  endTime: string;
} | null> {
  const { text } = await generateText({
    model: gateway(MODEL),
    system:
      "ユーザーの自然文から予定情報を抽出してJSON形式で返してください。" +
      '必ずtitle, date(YYYY-MM-DD), startTime(HH:MM), endTime(HH:MM)を含む純粋なJSONのみを返し、コードブロックは不要です。' +
      "解析不能なら null を返してください。今日の日付: " + new Date().toLocaleDateString("ja-JP"),
    prompt: userText,
  });

  try {
    const cleaned = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
