import type { LicenseInfo } from "../types";

/**
 * LemonSqueezy Webhook ペイロードの正規化。
 * 多種のイベント（subscription / license_key / order）から
 * (licenseKey, status, expiresAt, eventName) を抽出する。
 */
export type LsWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    type?: string;
    id?: string;
    attributes?: {
      // subscription 系
      status?: string;
      ends_at?: string | null;
      renews_at?: string | null;
      trial_ends_at?: string | null;
      // license_key 系
      key?: string;
      key_short?: string;
      license_key?: string;
      expires_at?: string | null;
      activation_limit?: number;
      // order 系
      first_order_item?: { license_key?: { key?: string } };
    };
    relationships?: {
      "license-keys"?: { data?: Array<{ id: string }> };
    };
  };
};

export type NormalizedEvent = {
  eventName: string;
  licenseKey: string | null;
  status: string | null;
  expiresAt: string | null;
};

/**
 * Webhook ペイロードから必要情報を抽出。
 * イベント種別ごとにフィールド位置が違うので統一的に取り出す。
 */
export function normalizeWebhookPayload(
  payload: LsWebhookPayload
): NormalizedEvent {
  const eventName = payload.meta?.event_name ?? "";
  const attrs = payload.data?.attributes ?? {};

  // license_key の場所は複数候補がある
  const licenseKey =
    attrs.key ??
    attrs.license_key ??
    attrs.first_order_item?.license_key?.key ??
    null;

  const status = attrs.status ?? null;

  // 期限: 優先順位は ends_at > renews_at > expires_at
  const expiresAt =
    attrs.ends_at ?? attrs.renews_at ?? attrs.expires_at ?? null;

  return {
    eventName,
    licenseKey,
    status,
    expiresAt,
  };
}

/**
 * HMAC-SHA256 で署名検証(timing-safe compare)。
 */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHex: string
): Promise<boolean> {
  if (!signatureHex || !secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const computedHex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqualHex(computedHex, signatureHex);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * イベント名から「ライセンスの有効化／無効化」のどちらに対応するか判定。
 */
export type WebhookAction = "activate" | "revoke" | "ignore";

export function actionFromEvent(eventName: string, status: string | null): WebhookAction {
  // 有効化イベント
  const activateEvents = [
    "subscription_created",
    "subscription_updated",
    "subscription_resumed",
    "subscription_unpaused",
    "license_key_created",
    "license_key_updated",
    "order_created",
  ];

  // 失効イベント
  const revokeEvents = [
    "subscription_cancelled",
    "subscription_expired",
    "subscription_paused",
    "license_key_revoked",
  ];

  if (activateEvents.includes(eventName)) {
    // status が active/inactive 系なら活性化
    if (
      !status ||
      status === "active" ||
      status === "inactive" ||
      status === "on_trial" ||
      status === "paid"
    ) {
      return "activate";
    }
    return "revoke";
  }

  if (revokeEvents.includes(eventName)) {
    return "revoke";
  }

  return "ignore";
}

/**
 * NormalizedEvent から LicenseInfo を構築。
 */
export function buildLicenseInfo(
  event: NormalizedEvent,
  action: WebhookAction
): LicenseInfo {
  if (action === "revoke") {
    return { valid: false, plan: "free" };
  }
  return {
    valid: true,
    plan: "pro",
    expiresAt: event.expiresAt ?? undefined,
  };
}
