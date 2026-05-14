# プライバシーポリシー / Privacy Policy

**最終更新日 / Last Updated**: 2026年5月14日

## 日本語版

### 1. はじめに

「AI Post Filter for X」(以下「本拡張機能」)は、X(旧Twitter)のタイムラインからAI生成投稿を検出・フィルタリングするためのブラウザ拡張機能です。本ポリシーでは、本拡張機能が取り扱うデータについて説明します。

### 2. 収集する情報

#### 2.1 投稿テキスト
- AI判定のため、X(twitter.com / x.com)上の投稿テキストを一時的に取得します
- 投稿テキストは判定のためにのみ使用され、保存されません

#### 2.2 IPアドレス
- レート制限管理のため、IPアドレスをCloudflare KVに最大25時間保存します
- 個人を特定する目的には使用しません

#### 2.3 ローカルデータ
- 拡張機能の設定情報(表示モード、しきい値、ホワイトリスト/ブラックリスト等)はブラウザのローカルストレージ(`chrome.storage`)に保存されます
- ユーザープロファイル分析データ(投稿パターンの統計)はブラウザのIndexedDBに保存されます
- これらは**ユーザーのブラウザ内のみ**に保存され、外部に送信されません

### 3. 第三者へのデータ送信

#### 3.1 Anthropic Claude API
- AI判定のため、投稿テキストをCloudflare Workers経由でAnthropic Claude APIに送信します
- Anthropicのプライバシーポリシー: https://www.anthropic.com/legal/privacy

#### 3.2 Cloudflare Workers
- APIプロキシ、レート制限管理、キャッシュのためにCloudflare Workersを使用しています
- 投稿テキストのハッシュ値とAI判定結果が最大7日間キャッシュされます
- Cloudflareのプライバシーポリシー: https://www.cloudflare.com/privacypolicy/

### 4. 収集しない情報

以下の情報は**一切収集しません**:
- ユーザー名、メールアドレス、本名等の個人情報
- ブラウジング履歴(X以外のサイトの閲覧履歴)
- パスワード、認証情報、金融情報
- 位置情報
- 投稿の永続的なコピー

### 5. データの保存期間

| データ種類 | 保存場所 | 保存期間 |
|---|---|---|
| 投稿テキスト | メモリ(一時的) | 判定処理中のみ |
| IPアドレス | Cloudflare KV | 最大25時間 |
| 判定結果ハッシュ | Cloudflare KV | 最大7日間 |
| 拡張機能設定 | ブラウザローカル | ユーザーが削除するまで |
| 統計情報 | ブラウザIndexedDB | ユーザーが削除するまで |

### 6. データの削除

ユーザーは以下の方法でデータを削除できます:

- **拡張機能のデータ**: `chrome://extensions` → 拡張機能を削除
- **判定キャッシュ**: 7日間で自動削除されます
- **IPアドレス**: 25時間で自動削除されます

### 7. セキュリティ

- 通信は全てHTTPS(TLS)で暗号化されています
- APIキーはサーバー側(Cloudflare Workers)にのみ保存され、ブラウザには公開されません
- レート制限により悪用を防いでいます

### 8. 子供のプライバシー

本拡張機能は13歳未満の児童を対象としていません。X(Twitter)の利用規約は13歳以上を対象としているため、本拡張機能のユーザーも同様です。

### 9. ポリシーの変更

本プライバシーポリシーは予告なく変更される場合があります。重要な変更がある場合はGitHubリポジトリで通知します。

### 10. お問い合わせ

ご質問・ご意見は以下までお寄せください:

- **GitHub Issues**: https://github.com/sakurabamasayuki/ai-post-filter-for-x/issues

---

## English Version

### 1. Introduction

"AI Post Filter for X" (hereinafter "the Extension") is a browser extension that detects and filters AI-generated posts on the X (formerly Twitter) timeline. This policy explains how the Extension handles data.

### 2. Information Collected

#### 2.1 Post Text
- Post text on X (twitter.com / x.com) is temporarily retrieved for AI detection
- Post text is used only for detection and is not stored permanently

#### 2.2 IP Address
- IP addresses are stored in Cloudflare KV for up to 25 hours for rate limit management
- Not used for personal identification purposes

#### 2.3 Local Data
- Extension settings (display mode, threshold, whitelist/blacklist, etc.) are stored in browser's local storage (`chrome.storage`)
- User profile analysis data (post pattern statistics) is stored in browser's IndexedDB
- These are stored **only within the user's browser** and are not transmitted externally

### 3. Data Transmission to Third Parties

#### 3.1 Anthropic Claude API
- Post text is sent to Anthropic Claude API via Cloudflare Workers for AI detection
- Anthropic Privacy Policy: https://www.anthropic.com/legal/privacy

#### 3.2 Cloudflare Workers
- Used for API proxying, rate limit management, and caching
- Hash values of post text and AI detection results are cached for up to 7 days
- Cloudflare Privacy Policy: https://www.cloudflare.com/privacypolicy/

### 4. Information NOT Collected

The following information is **never collected**:
- Personal information such as username, email, real name
- Browsing history (browsing history of sites other than X)
- Passwords, credentials, financial information
- Location information
- Persistent copies of posts

### 5. Data Retention Period

| Data Type | Storage Location | Retention Period |
|---|---|---|
| Post text | Memory (temporary) | During detection processing only |
| IP address | Cloudflare KV | Up to 25 hours |
| Detection result hash | Cloudflare KV | Up to 7 days |
| Extension settings | Browser local | Until user deletes |
| Statistics | Browser IndexedDB | Until user deletes |

### 6. Data Deletion

Users can delete data using the following methods:

- **Extension data**: `chrome://extensions` → Remove extension
- **Detection cache**: Auto-deleted after 7 days
- **IP address**: Auto-deleted after 25 hours

### 7. Security

- All communications are encrypted with HTTPS (TLS)
- API keys are stored only on the server (Cloudflare Workers) and not exposed to browsers
- Rate limiting prevents abuse

### 8. Children's Privacy

This Extension is not intended for children under 13. As X (Twitter) Terms of Service target users 13 and older, Extension users are similarly required to be 13 or older.

### 9. Policy Changes

This privacy policy may be changed without notice. Important changes will be notified on the GitHub repository.

### 10. Contact

For questions or feedback, please contact:

- **GitHub Issues**: https://github.com/sakurabamasayuki/ai-post-filter-for-x/issues
