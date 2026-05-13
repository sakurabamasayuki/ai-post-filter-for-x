@'
# LemonSqueezy セットアップ手順

AI Post Filter for X の Pro 版を販売・配信するための LemonSqueezy 設定手順です。

## 前提

- LemonSqueezy アカウント作成済み
- Cloudflare Workers デプロイ済み(URL: `https://ai-post-filter-api.your-subdomain.workers.dev`)
- Workers 環境変数 `LEMONSQUEEZY_API_KEY` / `LEMONSQUEEZY_STORE_ID` / `LEMONSQUEEZY_WEBHOOK_SECRET` 設定済み

## ステップ1: ストア作成(済の場合はスキップ)

1. https://app.lemonsqueezy.com にログイン
2. Settings → Stores → 新規ストア作成
3. Store ID をメモ(`wrangler.toml` の `LEMONSQUEEZY_STORE_ID` に設定)

## ステップ2: プロダクト作成

1. 左サイドバー Store → Products → **New Product**
2. プロダクト情報:
   - **Name**: `AI Post Filter Pro`
   - **Description**: `X (旧 Twitter) のタイムラインから AI 生成と推定される投稿をフィルタリングする Chrome 拡張機能の Pro 版`
   - **Status**: `Published`
3. Pricing → **Subscription** を選択:
   - **Monthly**: ¥500 / 月
   - **Yearly**: ¥5,000 / 年
4. **Save**

## ステップ3: License Key 機能を有効化

1. 作成したプロダクトの編集画面を開く
2. **License Keys** タブに移動
3. **Enable License Keys** をオン
4. オプション設定:
   - **Activation limit**: `3`(同一ユーザーが3デバイスまで使えるように)
   - **License key length**: `36`(UUID 形式推奨)
   - **License key format**: `XXXX-XXXX-XXXX-XXXX`
5. **Save**

## ステップ4: Webhook 設定

1. Settings → **Webhooks** → **+ Add webhook**
2. 設定:
   - **Callback URL**: `https://ai-post-filter-api.your-subdomain.workers.dev/webhook/lemonsqueezy`
   - **Signing secret**: 任意のランダム文字列(例: `whsec_aBcDeFgHiJkLmNoP...`、32文字以上推奨)
     ⚠️ ここで設定した値を必ずメモ
3. **Events** で以下にチェック:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_resumed`
   - `subscription_expired`
   - `subscription_paused`
   - `subscription_unpaused`
   - `license_key_created`
   - `license_key_updated`
   - `license_key_revoked`
   - `order_created`
4. **Save webhook**

## ステップ5: Webhook Secret を Workers に設定

ステップ4で控えた signing secret を:

```bash
cd workers
npx wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET