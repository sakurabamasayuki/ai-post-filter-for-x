# AI Post Filter — Backend (Cloudflare Workers)

Chrome 拡張 **AI Post Filter for X** のリモート判定エンジンを提供する Workers API です。

## エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/detect` | 投稿テキストの AI判定(Claude Haiku) |
| POST | `/api/license/validate` | ライセンスキー検証(LemonSqueezy) |
| POST | `/webhook/lemonsqueezy` | LemonSqueezy からの subscription 通知 |
| GET | `/api/health` | ヘルスチェック |

## アーキテクチャ

- ランタイム: Cloudflare Workers
- フレームワーク: Hono v4
- バリデーション: Zod
- LLM: Anthropic Claude 3.5 Haiku
- 課金: LemonSqueezy(ライセンスキー)
- ストレージ: KV Namespace × 2 (`DETECTION_CACHE` / `LICENSE_CACHE`)

## セットアップ

### 1. 依存インストール
```bash
cd workers
npm install
