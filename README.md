# グループ秘書Bot

LINEグループの会話を要約し、Googleカレンダーと連携する秘書AIです。

## 機能

| コマンド | 説明 |
|---|---|
| `まとめて` | 直近100件の会話をClaudeが要約 |
| `予定確認` | 今後1週間のGoogleカレンダーの予定を表示 |
| `予定追加 来週月曜15時から会議1時間` | 自然文で予定を追加 |
| `カレンダー連携` | GoogleカレンダーのOAuth認証URLを送信 |
| `ヘルプ` | コマンド一覧を表示 |

## セットアップ

### 1. 環境変数

```bash
cp .env.local.example .env.local
```

`.env.local` に各値を設定してください。

### 2. LINE Messaging API

1. [LINE Developers](https://developers.line.biz/) でチャンネルを作成
2. `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_CHANNEL_SECRET` を取得
3. Webhook URL に `https://your-domain.vercel.app/api/line/webhook` を設定
4. グループチャットへのBotを有効化

### 3. Google OAuth 2.0

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Calendar API を有効化
3. OAuth 2.0 クライアントIDを作成（リダイレクトURI: `https://your-domain.vercel.app/api/auth/google/callback`）

### 4. Neon Postgres (Vercel Marketplace)

Vercel ダッシュボード → Marketplace → Neon でデータベースを追加すると `DATABASE_URL` が自動設定されます。

初回デプロイ後、DB テーブルを作成:

```bash
curl -X POST https://your-domain.vercel.app/api/setup
```

### 5. Vercel AI Gateway

Vercel ダッシュボードから AI Gateway の API キーを取得し、`AI_GATEWAY_API_KEY` に設定します。

## デプロイ

```bash
vercel deploy --prod
```

## 技術スタック

- **Next.js 16** (App Router)
- **Vercel AI SDK** + **Vercel AI Gateway** (`anthropic/claude-sonnet-4.6`)
- **LINE Messaging API**
- **Google Calendar API** (OAuth 2.0)
- **Neon Postgres** + **Drizzle ORM**
