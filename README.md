# AI Post Filter for X

X（旧 Twitter）のタイムラインから **AI生成投稿を自動検出** し、ぼかし・非表示・ラベル表示するブラウザ拡張機能です。

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 機能

### 🤖 3段階の AI 判定エンジン

1. **ヒューリスティック判定**（ローカル）
   - AI特有の表現パターンを検出
   - 「第一に」「参考になれば」など典型的なAI表現
   - 構造化テキスト、過度な絵文字など

2. **アカウント信号分析** （ローカル）
   - ユーザープロフィール、投稿パターンから信頼度を算出
   - フォロー比率、返信速度などを監視

3. **Claude API による ML判定** （クラウド）
   - 高精度なAI生成判定
   - キャッシング対応で高速化

### 📊 表示モード

- **ぼかし表示**: AI判定投稿にブラー効果を適用
- **非表示**: AI判定投稿をタイムラインから隠す
- **ラベル表示**: AI判定スコアをバッジで表示

### 🔒 ホワイト/ブラックリスト

- ユーザーごとに判定をスキップ / 常に非表示に設定
- クイック設定で迅速に対応

### 📈 統計情報

- 本日のチェック数
- 検出件数、非表示件数を追跡

### ⚡ レート制限（無料プラン）

- 超過時は自動的にローカル判定で対応
- Pro ライセンスで無制限利用可能

---

## 🚀 インストール方法

### Chrome

1. **開発者向け手順**
   ```
   1. chrome://extensions を開く
   2. 「デベロッパーモード」を有効化
   3. 「拡張機能を読み込む」をクリック
   4. このリポジトリの dist/ フォルダを選択
   ```

2. **ストア版（近日公開予定）**
   - Chrome Web Store から直接インストール

### Firefox

- 対応予定

---

## 💻 開発環境セットアップ

### 必要環境

- Node.js 18+
- pnpm 8+

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/ai-post-filter-for-x.git
cd ai-post-filter-for-x

# 依存関係をインストール
pnpm install

# ビルド
pnpm run build

# 開発モード（ホットリロード対応）
pnpm run dev
```

### Chrome にロード

1. `chrome://extensions` を開く
2. 「デベロッパーモード」を有効化
3. 「拡張機能を読み込む」をクリック
4. `dist/` フォルダを選択

---

## 🏗️ プロジェクト構成

```
ai-post-filter-for-x/
├── entrypoints/
│   ├── background.ts           # Service Worker (ML推論、統計管理)
│   ├── content.ts              # Content Script (投稿検出、UI操作)
│   └── popup/
│       ├── index.html          # ポップアップUI
│       └── main.tsx            # ポップアップロジック（React）
│
├── src/
│   ├── lib/
│   │   ├── api-caller.ts       # Workers API連携
│   │   ├── db.ts               # IndexedDB操作
│   │   ├── detector/
│   │   │   ├── ml.ts           # ローカルML（ONNX/Transformers）
│   │   │   ├── heuristic.ts    # ヒューリスティック判定
│   │   │   └── account.ts      # アカウント信号分析
│   │   └── ...
│   ├── components/ui/          # shadcn/ui コンポーネント
│   └── styles/
│
├── workers/
│   ├── src/
│   │   ├── index.ts            # Hono ワーカー
│   │   ├── routes/
│   │   │   └── detect.ts       # /api/detect エンドポイント
│   │   └── lib/
│   │       ├── anthropic.ts    # Claude API連携
│   │       ├── rate-limit.ts   # レート制限チェック
│   │       ├── cors.ts         # CORS設定
│   │       └── ...
│   └── wrangler.toml           # Cloudflare Workers設定
│
├── wxt.config.ts               # WXT設定
├── tsconfig.json               # TypeScript設定
├── tailwind.config.ts          # Tailwind CSS設定
└── README.md
```

---

## 🔧 技術スタック

### フロントエンド

| 技術 | 用途 |
|------|------|
| **WXT** | Chrome 拡張機能フレームワーク |
| **TypeScript** | 型安全性 |
| **React 18** | UI コンポーネント |
| **Tailwind CSS** | スタイリング |
| **shadcn/ui** | UI コンポーネント集 |

### バックエンド

| 技術 | 用途 |
|------|------|
| **Cloudflare Workers** | サーバーレス API |
| **Hono** | ルーティングフレームワーク |
| **Claude API** | AI判定エンジン |
| **Cloudflare KV** | キャッシュ・レート制限 |

### ローカル ML

| ライブラリ | 用途 |
|----------|------|
| **ONNX Runtime** | 高速推論 |
| **Transformers.js** | モデル読み込み |

---

## 🔐 セキュリティ

### API キー管理

- Anthropic API キー → Cloudflare Workers に保存（secrets）
- ブラウザ側には保存しない
- CORS で拡張機能のみに制限

### データプライバシー

- 検出結果はローカルに保存（IndexedDB）
- 個人情報は送信しない
- キャッシュは KV に 7 日間保持

---

## 📊 使用状況データ

### 収集内容

- 検出投稿数（統計目的）
- API呼び出し回数（レート制限管理）

### 非収集

- 投稿内容
- ユーザー情報
- IPアドレス（Workers側でのみ使用）

---

## 🤝 貢献ガイド

### バグ報告

GitHub Issues に以下の情報を記載してください：

- 使用環境（OS、Chrome バージョン）
- 再現手順
- スクリーンショット

### 機能リクエスト

[Discussions](https://github.com/yourusername/ai-post-filter-for-x/discussions) で議論してください。

### プルリクエスト

1. Fork このリポジトリ
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. コミット (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Pull Request を作成

---

## 📝 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照

---

## 🙏 謝辞

- [Anthropic](https://anthropic.com) - Claude API
- [Cloudflare](https://cloudflare.com) - Workers・KV
- [WXT](https://wxt.dev) - 拡張機能フレームワーク
- [shadcn/ui](https://ui.shadcn.com) - UI コンポーネント

---

## 📚 その他の情報

### よくある質問

**Q: 日本語対応ですか？**
A: はい、完全に日本語対応しています。

**Q: Firefox で使えますか？**
A: 現在は Chrome のみです。

**Q: オフラインで動きますか？**
A: ローカル判定（ヒューリスティック・アカウント分析）はオフラインで動作します。Claude API による判定はオンライン必須です。

### サポート

- 📧 メール: support@example.com
- 💬 Twitter: [@yourhandle](https://twitter.com/yourhandle)
- 📖 ドキュメント: [Wiki](https://github.com/yourusername/ai-post-filter-for-x/wiki)

---

**最終更新**: 2026年5月13日
