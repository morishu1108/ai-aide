export default function Home() {
  return (
    <div className="min-h-screen bg-[#06C755] flex items-center justify-center">
      <main className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full mx-4 text-center">
        <div className="text-5xl mb-4">🤖</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">グループ秘書Bot</h1>
        <p className="text-gray-500 mb-6 text-sm">
          LINEグループの会話をまとめ、<br />Googleカレンダーと連携する秘書AIです。
        </p>
        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 text-sm text-gray-700">
          <p className="font-semibold text-gray-800">使い方</p>
          <div className="space-y-2">
            <p><span className="font-mono bg-green-100 text-green-800 px-1 rounded">まとめて</span> — 会話を要約</p>
            <p><span className="font-mono bg-green-100 text-green-800 px-1 rounded">予定確認</span> — 今後の予定を表示</p>
            <p><span className="font-mono bg-green-100 text-green-800 px-1 rounded">予定追加 [内容]</span> — 予定を追加</p>
            <p><span className="font-mono bg-green-100 text-green-800 px-1 rounded">カレンダー連携</span> — Google連携</p>
            <p><span className="font-mono bg-green-100 text-green-800 px-1 rounded">ヘルプ</span> — コマンド一覧</p>
          </div>
        </div>
        <p className="mt-6 text-xs text-gray-400">Webhook: /api/line/webhook</p>
      </main>
    </div>
  );
}
